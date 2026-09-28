/**
 * Cosmetics store API, shared by the Cloudflare Worker (production) and the
 * Vite dev server. Storage is a small key-value interface so each host can
 * back it differently (Durable Object storage vs a local JSON file).
 *
 * Data model (one key per record, all keyed by Minecraft UUID):
 *   player:<uuidhex>      OwnedRecord
 *   name:<lowercase>      uuidhex of the last known owner of that name
 *   legacy-name:<lower>   ownership imported from the old name-keyed store,
 *                         moved onto a UUID only after Mojang confirms it
 *   claim:<basket ident>  { uuid, at }: a paid basket can be claimed once
 *   sale:<uuidhex>        1: counted toward the collection limit (one per player)
 *   meta:collectionSold   number
 *   session:<token>       admin session expiry (ms)
 */
import {
  capeIdsFromPackages,
  isCollectionPackage,
  isFullCollection,
  knownCapeIds,
  type BasketPackage,
} from '../src/store/fulfillment.ts'
import { CAPES, freeCapeIds } from '../src/store/capes.ts'
import {
  INVALID_MINECRAFT_ACCOUNT,
  resolveMinecraftAccount,
  type MinecraftAccount,
} from '../src/store/minecraftAccount.ts'
import { inspectTebexWebhook } from './tebexWebhook.ts'

export interface StoreStorage {
  get<T>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
}

export type StoreConfig = {
  adminPassword: string
  tebexPublicToken: string
  tebexWebhookSecret: string
  collectionSlug: string
  collectionLimit: number
  allowedOrigins: string[]
}

export type OwnedRecord = {
  uuid: string
  username: string
  ownedCapeIds: string[]
  collection: boolean
}

type TebexBasket = {
  complete?: boolean
  username?: string | null
  username_id?: string | null
  packages?: BasketPackage[]
}

type Claim = { uuid: string; at: number }

export type StoreDeps = {
  storage: StoreStorage
  config: StoreConfig
  /** Resolves a Java username to its current UUID (Mojang). Injectable for tests. */
  resolveAccount?: (username: string) => Promise<MinecraftAccount>
  /** Loads a Tebex basket by ident. Injectable for tests. */
  fetchBasket?: (ident: string, publicToken: string) => Promise<TebexBasket | null>
}

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/
const IDENT_RE = /^[A-Za-z0-9._-]{6,128}$/
const SESSION_MS = 4 * 60 * 60 * 1000
const MAX_BODY = 32 * 1024

export function uuidKey(uuid = ''): string {
  const hex = String(uuid).replace(/-/g, '').toLowerCase()
  return /^[0-9a-f]{32}$/.test(hex) ? hex : ''
}

function dashed(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function nameKey(username = ''): string {
  return username.trim().toLowerCase()
}

class HttpError extends Error {
  status: number
  body: Record<string, unknown>
  constructor(status: number, message: string, extra: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.body = { error: message, ...extra }
  }
}

/**
 * Runs read-modify-write sections one at a time, so two purchases landing at
 * once can never overwrite each other. (Durable Objects already serialize
 * storage calls; this also covers awaits and the dev server.)
 */
export class StoreMutex {
  private tail: Promise<unknown> = Promise.resolve()
  run<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail.then(work, work)
    this.tail = next.catch(() => undefined)
    return next
  }
}

const rateTables = new Map<string, Map<string, { count: number; resetAt: number }>>()

function limited(table: string, key: string, max: number, windowMs: number): boolean {
  let rows = rateTables.get(table)
  if (!rows) rateTables.set(table, (rows = new Map()))
  const now = Date.now()
  const current = rows.get(key)
  if (!current || current.resetAt < now) {
    if (rows.size > 10_000) for (const [k, v] of rows) if (v.resetAt < now) rows.delete(k)
    rows.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }
  current.count += 1
  return current.count > max
}

export function resetRateLimits() {
  rateTables.clear()
}

async function sha256(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
}

async function passwordsMatch(given: string, expected: string) {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)])
  let out = 0
  for (let i = 0; i < a.length; i += 1) out |= a[i] ^ b[i]
  return out === 0
}

function randomToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function defaultFetchBasket(ident: string, publicToken: string): Promise<TebexBasket | null> {
  if (!ident || !publicToken) return null
  const response = await fetch(
    `https://headless.tebex.io/api/accounts/${encodeURIComponent(publicToken)}/baskets/${encodeURIComponent(ident)}`,
    { headers: { Accept: 'application/json' } },
  )
  if (!response.ok) return null
  const body = (await response.json()) as { data?: TebexBasket } & TebexBasket
  return body.data || body
}

export class CosmeticsStore {
  private storage: StoreStorage
  private config: StoreConfig
  private resolveAccount: (username: string) => Promise<MinecraftAccount>
  private fetchBasket: (ident: string, publicToken: string) => Promise<TebexBasket | null>
  private mutex = new StoreMutex()

  constructor(deps: StoreDeps) {
    this.storage = deps.storage
    this.config = deps.config
    this.resolveAccount = deps.resolveAccount || resolveMinecraftAccount
    this.fetchBasket = deps.fetchBasket || defaultFetchBasket
  }

  // ---- records ------------------------------------------------------------------

  private withFree(record: OwnedRecord): OwnedRecord {
    const owned = record.collection ? CAPES.map((cape) => cape.id) : record.ownedCapeIds
    return { ...record, ownedCapeIds: [...new Set([...owned, ...freeCapeIds()])] }
  }

  private async player(hex: string): Promise<OwnedRecord | null> {
    return (await this.storage.get<OwnedRecord>(`player:${hex}`)) || null
  }

  /** Public read: by UUID when given (authoritative), else by last known name. */
  async lookup(uuid: string, username: string): Promise<OwnedRecord> {
    let hex = uuidKey(uuid)
    const name = nameKey(username)
    if (!hex && name) hex = (await this.storage.get<string>(`name:${name}`)) || ''
    if (hex && name) await this.adoptLegacy(hex, name)
    const record = hex ? await this.player(hex) : null
    return this.withFree(
      record || { uuid: hex ? dashed(hex) : '', username, ownedCapeIds: [], collection: false },
    )
  }

  /**
   * Old records were keyed by name only. Move one onto a UUID only when
   * Mojang confirms that name currently belongs to that UUID, so nobody can
   * attach someone else's legacy purchases to their own account.
   */
  private async adoptLegacy(hex: string, name: string) {
    const legacy = await this.storage.get<Omit<OwnedRecord, 'uuid'>>(`legacy-name:${name}`)
    if (!legacy) return
    let account: MinecraftAccount
    try {
      account = await this.resolveAccount(name)
    } catch {
      return
    }
    if (uuidKey(account.uuid) !== hex) return
    await this.grant(account, legacy.ownedCapeIds || [], Boolean(legacy.collection), {
      extra: () => this.storage.delete(`legacy-name:${name}`),
    })
  }

  /**
   * Adds cloaks to a verified account. `paid` counts a collection toward the
   * limited stock. Inside the same lock, `before` runs first and may throw to
   * abort without writing anything; `extra` runs after the record is saved.
   */
  async grant(
    account: MinecraftAccount,
    capeIds: string[],
    collection: boolean,
    options: { paid?: boolean; before?: () => Promise<void>; extra?: () => Promise<void> } = {},
  ): Promise<OwnedRecord> {
    const hex = uuidKey(account.uuid)
    if (!hex) throw new HttpError(400, INVALID_MINECRAFT_ACCOUNT)
    return this.mutex.run(async () => {
      if (options.before) await options.before()
      const previous = await this.player(hex)
      const owned = [...new Set([...(previous?.ownedCapeIds || []), ...knownCapeIds(capeIds)])]
      const record: OwnedRecord = {
        uuid: dashed(hex),
        username: account.username,
        ownedCapeIds: owned,
        collection: Boolean(collection || previous?.collection || isFullCollection(owned)),
      }
      await this.storage.put(`player:${hex}`, record)
      await this.storage.put(`name:${nameKey(account.username)}`, hex)
      await this.indexPlayer(hex)
      if (options.paid && record.collection) await this.countCollectionSale(hex)
      if (options.extra) await options.extra()
      return this.withFree(record)
    })
  }

  async revoke(account: MinecraftAccount, capeIds: string[]): Promise<OwnedRecord> {
    const hex = uuidKey(account.uuid)
    if (!hex) throw new HttpError(400, INVALID_MINECRAFT_ACCOUNT)
    return this.mutex.run(async () => {
      const previous = await this.player(hex)
      const remove = new Set(capeIds)
      const start = previous?.collection ? CAPES.map((cape) => cape.id) : previous?.ownedCapeIds || []
      const record: OwnedRecord = {
        uuid: dashed(hex),
        username: account.username,
        ownedCapeIds: start.filter((id) => !remove.has(id)),
        collection: false,
      }
      await this.storage.put(`player:${hex}`, record)
      await this.storage.put(`name:${nameKey(account.username)}`, hex)
      await this.indexPlayer(hex)
      return this.withFree(record)
    })
  }

  // Must run inside the mutex.
  private async countCollectionSale(hex: string) {
    if (await this.storage.get(`sale:${hex}`)) return
    const sold = Number(await this.storage.get<number>('meta:collectionSold')) || 0
    await this.storage.put(`sale:${hex}`, 1)
    await this.storage.put('meta:collectionSold', sold + 1)
  }

  async collectionStock() {
    const cap = this.config.collectionLimit > 0 ? this.config.collectionLimit : 100
    const sold = Math.min(Number(await this.storage.get<number>('meta:collectionSold')) || 0, cap)
    return { limit: cap, sold, remaining: Math.max(0, cap - sold) }
  }

  async listPlayers(): Promise<OwnedRecord[]> {
    const index = (await this.storage.get<string[]>('index:players')) || []
    const players: OwnedRecord[] = []
    for (const hex of index) {
      const record = await this.player(hex)
      if (record) players.push(this.withFree(record))
    }
    return players.sort((a, b) => a.username.localeCompare(b.username))
  }

  // ---- purchases ------------------------------------------------------------------

  /**
   * Grants a paid Tebex basket. Each basket can be claimed exactly once; a
   * repeat claim for the same player is answered idempotently.
   */
  async claim(ident: string, bodyName: string) {
    const basket = await this.fetchBasket(ident, this.config.tebexPublicToken)
    if (!basket?.complete) {
      throw new HttpError(409, 'Payment is not complete yet.', { complete: false, granted: [] })
    }
    const packages = Array.isArray(basket.packages) ? basket.packages : []
    const granted = capeIdsFromPackages(packages, this.config.collectionSlug)
    if (granted.length === 0) {
      throw new HttpError(400, 'No cloaks were on this payment.', { complete: true, granted: [] })
    }
    const basketName = String(basket.username || '').trim()
    if (USERNAME_RE.test(basketName) && USERNAME_RE.test(bodyName) && nameKey(basketName) !== nameKey(bodyName)) {
      throw new HttpError(403, 'This payment belongs to a different Minecraft account.', {
        complete: true,
        granted: [],
      })
    }
    const username = USERNAME_RE.test(basketName) ? basketName : USERNAME_RE.test(bodyName) ? bodyName : ''
    if (!username) {
      throw new HttpError(400, 'Link a Minecraft account so this payment can be assigned.', {
        complete: true,
        granted,
      })
    }
    const account = await this.verifiedAccount(username)
    const hex = uuidKey(account.uuid)
    const collection = isCollectionPackage(packages, this.config.collectionSlug) || isFullCollection(granted)

    // Checked and recorded inside the lock, before anything is granted, so two
    // racing claims of one basket can never both win.
    const record = await this.grant(account, granted, collection, {
      paid: true,
      before: async () => {
        const current = await this.storage.get<Claim>(`claim:${ident}`)
        if (current && current.uuid !== hex) {
          throw new HttpError(409, 'This payment was already claimed by another account.', {
            complete: true,
            granted: [],
          })
        }
        if (!current) await this.storage.put(`claim:${ident}`, { uuid: hex, at: Date.now() })
      },
    })
    return { ...record, complete: true, granted }
  }

  async webhook(rawBody: string, signature: string, ip: string) {
    const inspected = await inspectTebexWebhook({
      rawBody,
      signature,
      ip,
      secret: this.config.tebexWebhookSecret,
    })
    if (inspected.kind === 'unauthorized') throw new HttpError(401, 'Invalid webhook signature.')
    if (inspected.kind === 'invalid') throw new HttpError(400, 'Invalid webhook.')
    if (inspected.kind === 'validation') return { id: inspected.id }
    if (inspected.kind === 'ignored') return { received: true, type: inspected.type }

    const granted = capeIdsFromPackages(inspected.packages, this.config.collectionSlug)
    if (!USERNAME_RE.test(inspected.username) || granted.length === 0) {
      return { received: true, granted: [], complete: true }
    }
    // Prefer the UUID Tebex verified at checkout; fall back to Mojang. If
    // neither is available, fail so Tebex retries later instead of dropping it.
    let account: MinecraftAccount
    if (uuidKey(inspected.uuid)) {
      account = { username: inspected.username, uuid: inspected.uuid }
    } else {
      account = await this.verifiedAccount(inspected.username)
    }
    const collection =
      isCollectionPackage(inspected.packages, this.config.collectionSlug) || isFullCollection(granted)
    const record = await this.grant(account, granted, collection, { paid: true })
    return { ...record, complete: true, granted }
  }

  private async verifiedAccount(username: string): Promise<MinecraftAccount> {
    try {
      return await this.resolveAccount(username)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message === INVALID_MINECRAFT_ACCOUNT) throw new HttpError(400, INVALID_MINECRAFT_ACCOUNT)
      throw new HttpError(503, 'Could not verify the Minecraft account right now. Try again shortly.')
    }
  }

  // Must run inside the mutex.
  private async indexPlayer(hex: string) {
    const index = (await this.storage.get<string[]>('index:players')) || []
    if (!index.includes(hex)) await this.storage.put('index:players', [...index, hex])
  }

  // ---- admin -----------------------------------------------------------------------

  async adminLogin(password: string) {
    const expected = this.config.adminPassword
    if (!expected || expected.length < 8) {
      throw new HttpError(503, 'Admin password is not configured on this server.')
    }
    if (!(await passwordsMatch(password, expected))) throw new HttpError(401, 'Wrong password.')
    const token = randomToken()
    await this.storage.put(`session:${token}`, Date.now() + SESSION_MS)
    return token
  }

  async validSession(token: string) {
    if (!/^[0-9a-f]{64}$/.test(token)) return false
    const expires = Number(await this.storage.get<number>(`session:${token}`))
    if (!expires || expires < Date.now()) {
      await this.storage.delete(`session:${token}`)
      return false
    }
    return true
  }

  async adminGrant(username: string, capeIds: string[], collection: boolean) {
    const account = await this.verifiedAccount(username)
    const ids = knownCapeIds(capeIds)
    return this.grant(account, ids, collection || isFullCollection(ids))
  }

  async adminRevoke(username: string, capeIds: string[]) {
    const ids = knownCapeIds(capeIds)
    if (ids.length === 0) throw new HttpError(400, 'Select at least one cloak to remove.')
    return this.revoke(await this.verifiedAccount(username), ids)
  }

  // ---- HTTP -------------------------------------------------------------------------

  async handle(request: Request, ip: string): Promise<Response> {
    const origin = request.headers.get('Origin')
    const url = new URL(request.url)
    const path = normalizePath(url.pathname)
    const method = request.method
    const send = (status: number, body: unknown) => json(status, body, origin, this.config.allowedOrigins)

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin, this.config.allowedOrigins) })
    }

    try {
      if (path === '/api/webhooks/tebex' && method === 'GET') return send(200, { ok: true, endpoint: 'webhooks' })
      if (path === '/api/webhooks/tebex' && method === 'POST') {
        const raw = await readText(request)
        return send(200, await this.webhook(raw, request.headers.get('X-Signature') || '', ip))
      }

      if (path === '/api/collection-stock' && method === 'GET') return send(200, await this.collectionStock())
      // Sales are counted when a verified purchase is granted; kept for old clients.
      if (path === '/api/collection-sale' && method === 'POST') {
        return send(200, { ...(await this.collectionStock()), recorded: false })
      }

      if (path === '/api/cosmetics/claim' && method === 'POST') {
        if (limited('claim', ip, 20, 10 * 60 * 1000)) throw new HttpError(429, 'Too many claim attempts. Try again in a few minutes.')
        const body = await readJson(request)
        const ident = String(body.ident || '').trim()
        if (!IDENT_RE.test(ident)) throw new HttpError(400, 'Missing checkout id.')
        return send(200, await this.claim(ident, String(body.username || '').trim()))
      }

      if (
        method === 'GET' &&
        ['/api/cosmetics/owned', '/api/cosmetics', '/api/v1/cosmetics', '/api/v1/cosmetics/owned'].includes(path)
      ) {
        const username = url.searchParams.get('username') || ''
        if (username && !USERNAME_RE.test(username)) throw new HttpError(400, 'Enter a valid Java Edition username.')
        return send(200, await this.lookup(url.searchParams.get('uuid') || '', username))
      }
      if (method === 'POST' && ['/api/cosmetics/grant', '/api/cosmetics', '/api/v1/cosmetics'].includes(path)) {
        throw new HttpError(403, 'Cloaks are granted after a verified payment or by an admin.')
      }

      if (path === '/api/admin/login' && method === 'POST') {
        if (limited('login', ip, 8, 10 * 60 * 1000)) throw new HttpError(429, 'Too many login attempts. Try again in a few minutes.')
        const body = await readJson(request)
        return send(200, { ok: true, token: await this.adminLogin(String(body.password || '')) })
      }
      if (path === '/api/admin/logout' && method === 'POST') {
        const token = bearerToken(request)
        if (token) await this.storage.delete(`session:${token}`)
        return send(200, { ok: true })
      }
      if (path.startsWith('/api/admin/')) {
        if (!(await this.validSession(bearerToken(request)))) throw new HttpError(401, 'Admin login required.')
        if (path === '/api/admin/players' && method === 'GET') return send(200, { players: await this.listPlayers() })
        if (limited('admin', ip, 40, 10 * 60 * 1000)) throw new HttpError(429, 'Too many admin requests. Try again in a few minutes.')
        const body = await readJson(request)
        const username = String(body.username || '').trim()
        const capeIds = Array.isArray(body.capeIds) ? body.capeIds.map(String) : []
        if (path === '/api/admin/grant' && method === 'POST') {
          return send(200, await this.adminGrant(username, capeIds, Boolean(body.collection)))
        }
        if (path === '/api/admin/revoke' && method === 'POST') {
          return send(200, await this.adminRevoke(username, capeIds))
        }
      }
    } catch (error) {
      if (error instanceof HttpError) return send(error.status, error.body)
      return send(500, { error: 'store-error' })
    }
    return send(404, { error: 'Not found.' })
  }
}

function normalizePath(pathname: string) {
  const clean = pathname.replace(/\/+$/, '') || '/'
  if (clean.startsWith('/api/') || clean === '/api') return clean
  return `/api${clean.startsWith('/') ? clean : `/${clean}`}`
}

async function readText(request: Request) {
  const declared = Number(request.headers.get('Content-Length') || 0)
  if (declared > MAX_BODY) throw new HttpError(413, 'Request is too large.')
  const raw = await request.text()
  if (raw.length > MAX_BODY) throw new HttpError(413, 'Request is too large.')
  return raw
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const raw = await readText(request)
  if (!raw.trim()) return {}
  try {
    const value = JSON.parse(raw) as unknown
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  } catch {
    // Fall through.
  }
  throw new HttpError(400, 'Invalid JSON.')
}

function bearerToken(request: Request) {
  const header = request.headers.get('Authorization') || ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin && allowed.includes(origin) ? origin : allowed[0] || '',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  }
}

function json(status: number, body: unknown, origin: string | null, allowed: string[]) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...corsHeaders(origin, allowed),
    },
  })
}

// ---- migration from the old single-blob store ------------------------------------------

type LegacyStoreFile = {
  byUuid?: Record<string, Partial<OwnedRecord>>
  byName?: Record<string, Partial<OwnedRecord>>
  collectionSold?: number
}

/** Imports the old `cosmetics-owned` JSON blob. Safe to run more than once. */
export async function importLegacyStore(storage: StoreStorage, legacy: LegacyStoreFile | null) {
  if (await storage.get('meta:migrated')) return
  const index = new Set((await storage.get<string[]>('index:players')) || [])
  const merge = async (hex: string, record: Partial<OwnedRecord>) => {
    const previous = await storage.get<OwnedRecord>(`player:${hex}`)
    const owned = [...new Set([...(previous?.ownedCapeIds || []), ...knownCapeIds(record.ownedCapeIds || [])])]
    const username = String(record.username || previous?.username || '')
    await storage.put(`player:${hex}`, {
      uuid: dashed(hex),
      username,
      ownedCapeIds: owned,
      collection: Boolean(record.collection || previous?.collection),
    })
    if (username) await storage.put(`name:${nameKey(username)}`, hex)
    index.add(hex)
  }
  for (const record of Object.values(legacy?.byUuid || {})) {
    const hex = uuidKey(record.uuid)
    if (hex) await merge(hex, record)
  }
  for (const [name, record] of Object.entries(legacy?.byName || {})) {
    const hex = uuidKey(record.uuid)
    if (hex) {
      await merge(hex, record)
    } else if (USERNAME_RE.test(name)) {
      await storage.put(`legacy-name:${nameKey(name)}`, {
        username: String(record.username || name),
        ownedCapeIds: knownCapeIds(record.ownedCapeIds || []),
        collection: Boolean(record.collection),
      })
    }
  }
  await storage.put('index:players', [...index])
  await storage.put('meta:collectionSold', Math.max(0, Math.floor(Number(legacy?.collectionSold) || 0)))
  await storage.put('meta:migrated', true)
}
