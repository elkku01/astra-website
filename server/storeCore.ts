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
 *   order:<checkout id>   Stripe order: { uuid, username, capes, collection, pi, at }
 *   pi:<payment intent>   checkout id, to find the order again on refund/dispute
 *   sale:<uuidhex>        1: counted toward the collection limit (one per player)
 *   meta:collectionSold   number
 *   session:<token>       admin session expiry (ms)
 */
import { knownBadge } from '../src/store/badgeIds.ts'
import { isFullCollection, knownCapeIds } from '../src/store/fulfillment.ts'
import { EARLY_ACCESS_LIMIT, EARLY_ACCESS_WING, WINGS, knownWingIds } from '../src/store/wings.ts'
import { CAPES, COLLECTION_LAUNCH_PRICE, freeCapeIds, paidCapes } from '../src/store/capes.ts'
import {
  INVALID_MINECRAFT_ACCOUNT,
  resolveMinecraftAccount,
  type MinecraftAccount,
} from '../src/store/minecraftAccount.ts'
import {
  checkoutForm,
  stripeRequester,
  verifyStripeEvent,
  type CheckoutLine,
  type CheckoutSession,
  type StripeRequest,
} from './stripe.ts'

export interface StoreStorage {
  get<T>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
}

export type StoreConfig = {
  adminPassword: string
  stripeSecretKey: string
  stripeWebhookSecret: string
  /** Public site root for Stripe's return links, e.g. https://elkku01.github.io/astra-website */
  siteUrl: string
  collectionLimit: number
  allowedOrigins: string[]
  /** Shared secret the presence API uses for server-to-server calls (early-access grants). */
  internalKey?: string
}

export type OwnedRecord = {
  uuid: string
  username: string
  ownedCapeIds: string[]
  collection: boolean
  ownedWingIds?: string[]
  /** Nametag icon role given by an admin ('creator' | 'owner' | 'booster' | 'admin'); none = default white. */
  badge?: string
}

type Order = {
  uuid: string
  username: string
  capes: string[]
  wings?: string[]
  collection: boolean
  pi: string
  at: number
  revoked?: boolean
}

export type StoreDeps = {
  storage: StoreStorage
  config: StoreConfig
  /** Resolves a Java username to its current UUID (Mojang). Injectable for tests. */
  resolveAccount?: (username: string) => Promise<MinecraftAccount>
  /** Calls the Stripe API. Injectable for tests. */
  stripe?: StripeRequest
}

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/
const SESSION_ID_RE = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/
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

class DuplicateOrder extends Error {}

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

/** The claim's place in line (1 = first), or null for unknown records. */
function earlyClaimNumber(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null
  const number = Number((value as { number?: unknown }).number)
  return Number.isInteger(number) && number > 0 ? number : null
}

export class CosmeticsStore {
  private storage: StoreStorage
  private config: StoreConfig
  private resolveAccount: (username: string) => Promise<MinecraftAccount>
  private stripe: StripeRequest
  private mutex = new StoreMutex()

  constructor(deps: StoreDeps) {
    this.storage = deps.storage
    this.config = deps.config
    this.resolveAccount = deps.resolveAccount || resolveMinecraftAccount
    this.stripe = deps.stripe || stripeRequester(deps.config.stripeSecretKey)
  }

  // ---- records ------------------------------------------------------------------

  private withFree(record: OwnedRecord): OwnedRecord {
    const owned = record.collection ? CAPES.map((cape) => cape.id) : record.ownedCapeIds
    const badge = knownBadge(record.badge)
    return {
      ...record,
      badge,
      ownedCapeIds: [...new Set([...owned, ...freeCapeIds()])],
      ownedWingIds: knownWingIds(record.ownedWingIds || []),
    }
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
    options: {
      paid?: boolean
      wings?: string[]
      before?: () => Promise<void>
      extra?: () => Promise<void>
    } = {},
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
        ownedWingIds: knownWingIds([...(previous?.ownedWingIds || []), ...(options.wings || [])]),
        ...(previous?.badge ? { badge: previous.badge } : {}),
      }
      await this.storage.put(`player:${hex}`, record)
      await this.storage.put(`name:${nameKey(account.username)}`, hex)
      await this.indexPlayer(hex)
      if (options.paid && record.collection) await this.countCollectionSale(hex)
      if (options.extra) await options.extra()
      return this.withFree(record)
    })
  }

  async revoke(account: MinecraftAccount, capeIds: string[], wingIds: string[] = []): Promise<OwnedRecord> {
    const hex = uuidKey(account.uuid)
    if (!hex) throw new HttpError(400, INVALID_MINECRAFT_ACCOUNT)
    return this.mutex.run(async () => {
      const previous = await this.player(hex)
      const remove = new Set(capeIds)
      const removeWings = new Set(wingIds)
      const start = previous?.collection ? CAPES.map((cape) => cape.id) : previous?.ownedCapeIds || []
      const record: OwnedRecord = {
        uuid: dashed(hex),
        username: account.username,
        ownedCapeIds: start.filter((id) => !remove.has(id)),
        collection: false,
        ownedWingIds: (previous?.ownedWingIds || []).filter((id) => !removeWings.has(id)),
        ...(previous?.badge ? { badge: previous.badge } : {}),
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
   * Starts a Stripe Checkout (Managed Payments) for a verified Minecraft
   * account. Prices come from the catalog on the server, never the browser.
   */
  async checkout(username: string, capeIds: string[], collection: boolean, wingIds: string[] = []) {
    if (!this.config.stripeSecretKey) {
      throw new HttpError(503, 'Purchases are paused for a moment while we move to a new payment provider. Please try again soon.')
    }
    const account = await this.verifiedAccount(username)
    const hex = uuidKey(account.uuid)
    const owned = await this.lookup(account.uuid, account.username)
    const paid = new Set(paidCapes().map((cape) => cape.id))
    let lines: CheckoutLine[]
    let ids: string[] = []
    let wings: string[] = []
    if (wingIds.length) {
      // Only wings that are for sale; Obsidian (early access) can never be bought.
      wings = knownWingIds(wingIds).filter(
        (id) => WINGS.find((wing) => wing.id === id)?.purchasable && !(owned.ownedWingIds || []).includes(id),
      )
      if (wings.length === 0) throw new HttpError(409, 'Those wings are not for sale or you already own them.')
      lines = wings.map((id) => {
        const wing = WINGS.find((item) => item.id === id)!
        return {
          name: `Astra Wings: ${wing.name}`,
          description: `Unlocks on ${account.username}.`,
          amountCents: Math.round(wing.price * 100),
        }
      })
    } else if (collection) {
      if (owned.collection) throw new HttpError(409, 'You already own the entire collection.')
      const stock = await this.collectionStock()
      if (stock.remaining <= 0) throw new HttpError(409, 'The launch collection is sold out.')
      ids = [...paid]
      lines = [{
        name: 'Astra Cloaks: Entire Collection',
        description: `All ${ids.length} paid Astra cloaks for ${account.username}.`,
        amountCents: Math.round(COLLECTION_LAUNCH_PRICE * 100),
      }]
    } else {
      ids = knownCapeIds(capeIds).filter((id) => paid.has(id) && !owned.ownedCapeIds.includes(id))
      if (ids.length === 0) throw new HttpError(409, 'You already own these cloaks.')
      lines = ids.map((id) => {
        const cape = CAPES.find((item) => item.id === id)!
        return {
          name: `Astra ${cape.name}`,
          description: `Unlocks on ${account.username}.`,
          amountCents: Math.round(cape.price * 100),
        }
      })
    }
    const site = this.config.siteUrl.replace(/\/+$/, '')
    if (!/^https?:\/\//.test(site)) throw new HttpError(503, 'Store checkout is not configured.')
    const form = checkoutForm({
      lines,
      successUrl: `${site}/store/checkout?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${site}/store/checkout?cancelled=1`,
      clientReferenceId: hex,
      metadata: {
        uuid: hex,
        username: account.username,
        capes: ids.join(','),
        wings: wings.join(','),
        collection: collection ? '1' : '0',
      },
    })
    const session = (await this.stripe('POST', '/checkout/sessions', form).catch((error: unknown) => {
      throw new HttpError(502, error instanceof Error ? error.message : 'Could not start checkout.')
    })) as unknown as CheckoutSession
    if (!session.url) throw new HttpError(502, 'Stripe did not return a checkout link.')
    return { url: session.url, id: session.id }
  }

  /** Grants a paid Checkout Session exactly once (safe to call from webhook and return page). */
  async fulfill(session: CheckoutSession) {
    if (session.payment_status !== 'paid') return { complete: false, granted: [] as string[] }
    const meta = session.metadata || {}
    const hex = uuidKey(meta.uuid || '')
    const username = String(meta.username || '')
    if (!hex || !USERNAME_RE.test(username)) throw new HttpError(400, 'Checkout is missing the Minecraft account.')
    const ids = knownCapeIds(String(meta.capes || '').split(',').filter(Boolean))
    const wings = knownWingIds(String(meta.wings || '').split(',').filter(Boolean)).filter(
      (id) => WINGS.find((wing) => wing.id === id)?.purchasable,
    )
    const collection = meta.collection === '1'
    const key = `order:${session.id}`
    const existing = await this.storage.get<Order>(key)
    if (existing) return { complete: true, granted: [...existing.capes, ...(existing.wings || [])], uuid: existing.uuid }
    const pi = typeof session.payment_intent === 'string' ? session.payment_intent : ''
    let duplicate = false
    await this.grant({ uuid: dashed(hex), username }, ids, collection || isFullCollection(ids), {
      paid: true,
      wings,
      before: async () => {
        if (await this.storage.get(key)) {
          duplicate = true
          throw new DuplicateOrder()
        }
        await this.storage.put(key, { uuid: hex, username, capes: ids, wings, collection, pi, at: Date.now() } satisfies Order)
        if (pi) await this.storage.put(`pi:${pi}`, session.id)
      },
    }).catch((error: unknown) => {
      if (!(error instanceof DuplicateOrder)) throw error
    })
    return { complete: true, granted: [...ids, ...wings], uuid: dashed(hex), duplicate }
  }

  /** Return-page check: the webhook usually got there first; if not, ask Stripe directly. */
  async checkoutStatus(sessionId: string) {
    if (!SESSION_ID_RE.test(sessionId)) throw new HttpError(400, 'Missing checkout id.')
    const order = await this.storage.get<Order>(`order:${sessionId}`)
    if (order) {
      return { complete: true, granted: [...order.capes, ...(order.wings || [])], uuid: dashed(order.uuid), username: order.username }
    }
    const session = (await this.stripe('GET', `/checkout/sessions/${encodeURIComponent(sessionId)}`).catch(() => null)) as
      | CheckoutSession
      | null
    if (!session) return { complete: false, granted: [] as string[] }
    const result = await this.fulfill(session)
    return { ...result, username: session.metadata?.username || '' }
  }

  async stripeWebhook(rawBody: string, signature: string) {
    const event = await verifyStripeEvent(rawBody, signature, this.config.stripeWebhookSecret)
    if (!event) throw new HttpError(400, 'Invalid Stripe signature.')
    const type = String(event.type || '')
    const object = ((event.data as { object?: unknown } | undefined)?.object || {}) as Record<string, unknown>
    if (type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded') {
      return { received: true, ...(await this.fulfill(object as unknown as CheckoutSession)) }
    }
    // Money went back (full refund) or is being disputed: take the cloaks back.
    const fullRefund = type === 'charge.refunded' && object.refunded === true
    if (fullRefund || type === 'charge.dispute.created') {
      const pi = String(object.payment_intent || '')
      const sessionId = pi ? await this.storage.get<string>(`pi:${pi}`) : undefined
      const order = sessionId ? await this.storage.get<Order>(`order:${sessionId}`) : undefined
      if (order && !order.revoked) {
        await this.revoke({ uuid: dashed(order.uuid), username: order.username }, order.capes, order.wings || [])
        await this.storage.put(`order:${sessionId}`, { ...order, revoked: true })
        return { received: true, revoked: order.capes }
      }
    }
    return { received: true, ignored: type }
  }

  /**
   * Grants the early-access wings to a player the presence API has verified
   * (Mojang-signed certificate). Counted under the store lock, so never more
   * than EARLY_ACCESS_LIMIT players get them. Each UUID can claim once.
   */
  async earlyAccess(uuid: string, username: string) {
    const hex = uuidKey(uuid)
    if (!hex || !USERNAME_RE.test(username)) throw new HttpError(400, 'Invalid player.')
    let outcome: 'granted' | 'already' | 'full' = 'granted'
    let number: number | null = null
    await this.grant({ uuid: dashed(hex), username }, [], false, {
      wings: [EARLY_ACCESS_WING],
      before: async () => {
        await this.numberLegacyEarlyClaims()
        const existing = await this.storage.get<unknown>(`early:${hex}`)
        if (existing) {
          outcome = 'already'
          number = earlyClaimNumber(existing)
          throw new DuplicateOrder()
        }
        const claimed = Number(await this.storage.get<number>('meta:earlyAccessClaimed')) || 0
        if (claimed >= EARLY_ACCESS_LIMIT) {
          outcome = 'full'
          throw new DuplicateOrder()
        }
        number = claimed + 1
        await this.storage.put(`early:${hex}`, { at: Date.now(), number })
        await this.storage.put('meta:earlyAccessClaimed', number)
      },
    }).catch((error: unknown) => {
      if (!(error instanceof DuplicateOrder)) throw error
    })
    return { outcome, number, ...(await this.earlyAccessStock()) }
  }

  /**
   * Claims made before claim numbers were stored only kept a timestamp; number
   * those once, in claim order. Must run inside the mutex.
   */
  private async numberLegacyEarlyClaims() {
    if (await this.storage.get('meta:earlyAccessNumbered')) return
    const players = (await this.storage.get<string[]>('index:players')) || []
    const legacy: { hex: string; at: number }[] = []
    let highest = 0
    for (const hex of players) {
      const value = await this.storage.get<unknown>(`early:${hex}`)
      if (typeof value === 'number') legacy.push({ hex, at: value })
      else highest = Math.max(highest, earlyClaimNumber(value) || 0)
    }
    legacy.sort((a, b) => a.at - b.at)
    let next = highest
    for (const claim of legacy) {
      next += 1
      await this.storage.put(`early:${claim.hex}`, { at: claim.at, number: next })
    }
    const claimed = Number(await this.storage.get<number>('meta:earlyAccessClaimed')) || 0
    if (next > claimed) await this.storage.put('meta:earlyAccessClaimed', next)
    await this.storage.put('meta:earlyAccessNumbered', true)
  }

  async earlyAccessStock() {
    const claimed = Math.min(Number(await this.storage.get<number>('meta:earlyAccessClaimed')) || 0, EARLY_ACCESS_LIMIT)
    return { limit: EARLY_ACCESS_LIMIT, claimed, remaining: EARLY_ACCESS_LIMIT - claimed }
  }

  private async internalAuthorized(request: Request) {
    const expected = this.config.internalKey || ''
    const given = bearerToken(request)
    if (expected.length < 32 || !given) return false
    return passwordsMatch(given, expected)
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

  async adminGrant(username: string, capeIds: string[], collection: boolean, wingIds: string[] = []) {
    const account = await this.verifiedAccount(username)
    const ids = knownCapeIds(capeIds)
    return this.grant(account, ids, collection || isFullCollection(ids), { wings: knownWingIds(wingIds) })
  }

  /** Sets (or with '' clears) a player's nametag icon role. Admin only; badges are never sold. */
  async adminSetBadge(username: string, badge: string) {
    const wanted = knownBadge(badge)
    if (badge && !wanted) throw new HttpError(400, 'Unknown icon.')
    const account = await this.verifiedAccount(username)
    const hex = uuidKey(account.uuid)
    if (!hex) throw new HttpError(400, INVALID_MINECRAFT_ACCOUNT)
    return this.mutex.run(async () => {
      const previous = await this.player(hex)
      const record: OwnedRecord = {
        uuid: dashed(hex),
        username: account.username,
        ownedCapeIds: previous?.ownedCapeIds || [],
        collection: Boolean(previous?.collection),
        ownedWingIds: previous?.ownedWingIds || [],
      }
      if (wanted) record.badge = wanted
      await this.storage.put(`player:${hex}`, record)
      await this.storage.put(`name:${nameKey(account.username)}`, hex)
      await this.indexPlayer(hex)
      return this.withFree(record)
    })
  }

  async adminRevoke(username: string, capeIds: string[], wingIds: string[] = []) {
    const ids = knownCapeIds(capeIds)
    const wings = knownWingIds(wingIds)
    if (ids.length === 0 && wings.length === 0) throw new HttpError(400, 'Select at least one cloak or wings to remove.')
    return this.revoke(await this.verifiedAccount(username), ids, wings)
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
      if (path === '/api/webhooks/stripe' && method === 'POST') {
        const raw = await request.text() // exact bytes are needed for the signature
        return send(200, await this.stripeWebhook(raw, request.headers.get('Stripe-Signature') || ''))
      }

      if (path === '/api/collection-stock' && method === 'GET') return send(200, await this.collectionStock())

      if (path === '/api/checkout' && method === 'POST') {
        if (limited('checkout', ip, 20, 10 * 60 * 1000)) throw new HttpError(429, 'Too many checkouts. Try again in a few minutes.')
        const body = await readJson(request)
        const capeIds = Array.isArray(body.capeIds) ? body.capeIds.map(String) : []
        const wingIds = Array.isArray(body.wingIds) ? body.wingIds.map(String) : []
        return send(200, await this.checkout(String(body.username || '').trim(), capeIds, body.collection === true, wingIds))
      }

      if (path === '/api/early-access' && method === 'GET') return send(200, await this.earlyAccessStock())

      // Server-to-server only: the presence API reports a verified launcher sign-in.
      if (path === '/api/internal/early-access' && method === 'POST') {
        if (!(await this.internalAuthorized(request))) throw new HttpError(401, 'Unauthorized.')
        const body = await readJson(request)
        return send(200, await this.earlyAccess(String(body.uuid || ''), String(body.username || '').trim()))
      }

      if (path === '/api/checkout/status' && method === 'GET') {
        if (limited('status', ip, 120, 10 * 60 * 1000)) throw new HttpError(429, 'Too many requests.')
        return send(200, await this.checkoutStatus(url.searchParams.get('session_id') || ''))
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
        const wingIds = Array.isArray(body.wingIds) ? body.wingIds.map(String) : []
        if (path === '/api/admin/grant' && method === 'POST') {
          return send(200, await this.adminGrant(username, capeIds, Boolean(body.collection), wingIds))
        }
        if (path === '/api/admin/revoke' && method === 'POST') {
          return send(200, await this.adminRevoke(username, capeIds, wingIds))
        }
        if (path === '/api/admin/badge' && method === 'POST') {
          return send(200, await this.adminSetBadge(username, String(body.badge || '')))
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
