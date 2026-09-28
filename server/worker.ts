import {
  capeIdsFromPackages,
  isCollectionPackage,
  isFullCollection,
  knownCapeIds,
} from '../src/store/fulfillment.ts'
import { freeCapeIds } from '../src/store/capes.ts'
import { INVALID_MINECRAFT_ACCOUNT, resolveMinecraftAccount } from '../src/store/minecraftAccount.ts'
import { inspectTebexWebhook } from './tebexWebhook.ts'

type OwnedRecord = {
  uuid: string
  username: string
  ownedCapeIds: string[]
  collection: boolean
}

type StoreFile = {
  byUuid: Record<string, OwnedRecord>
  byName: Record<string, OwnedRecord>
  collectionSold: number
  collectionSaleIdents: string[]
}

type TebexBasket = {
  complete?: boolean
  username?: string | null
  packages?: { slug?: string; name?: string }[]
}

export interface Env {
  STORE: KVNamespace
  ADMIN_PASSWORD: string
  TEBEX_PUBLIC_TOKEN?: string
  TEBEX_WEBHOOK_SECRET?: string
  COLLECTION_SLUG?: string
  COLLECTION_LIMIT?: string
}

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/
const IDENT_RE = /^[A-Za-z0-9._-]{6,128}$/
const STORE_KEY = 'cosmetics-owned'
const SESSION_MS = 4 * 60 * 60 * 1000
const ALLOWED_ORIGINS = [
  'https://elkku01.github.io',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
]

const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const adminAttempts = new Map<string, { count: number; resetAt: number }>()
const claimAttempts = new Map<string, { count: number; resetAt: number }>()

function emptyStore(): StoreFile {
  return { byUuid: {}, byName: {}, collectionSold: 0, collectionSaleIdents: [] }
}

function uuidKey(uuid = '') {
  const hex = uuid.replace(/-/g, '').toLowerCase()
  return /^[0-9a-f]{32}$/.test(hex) ? hex : ''
}

function nameKey(username = '') {
  return username.trim().toLowerCase()
}

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  }
}

function json(status: number, body: unknown, origin: string | null, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...corsHeaders(origin),
      ...extra,
    },
  })
}

function normalizePath(pathname: string) {
  const clean = pathname.replace(/\/+$/, '') || '/'
  if (clean === '/api') return '/api'
  return clean.startsWith('/api/') ? clean : `/api${clean.startsWith('/') ? clean : `/${clean}`}`
}

function limited(
  table: Map<string, { count: number; resetAt: number }>,
  ip: string,
  max: number,
  windowMs: number,
) {
  const now = Date.now()
  const current = table.get(ip)
  if (!current || current.resetAt < now) {
    table.set(ip, { count: 1, resetAt: now + windowMs })
    return false
  }
  current.count += 1
  return current.count > max
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value)
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data))
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i += 1) out |= a[i] ^ b[i]
  return out === 0
}

async function passwordsMatch(given: string, expected: string) {
  return timingSafeEqual(await sha256(given), await sha256(expected))
}

function clientIp(request: Request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown'
}

function bearerToken(request: Request) {
  const header = request.headers.get('Authorization') || ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

function randomToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function readStore(env: Env): Promise<StoreFile> {
  const raw = await env.STORE.get(STORE_KEY)
  if (!raw) return emptyStore()
  try {
    const parsed = JSON.parse(raw) as StoreFile
    return {
      byUuid: parsed?.byUuid && typeof parsed.byUuid === 'object' ? parsed.byUuid : {},
      byName: parsed?.byName && typeof parsed.byName === 'object' ? parsed.byName : {},
      collectionSold: Math.max(0, Math.floor(Number(parsed?.collectionSold) || 0)),
      collectionSaleIdents: Array.isArray(parsed.collectionSaleIdents)
        ? parsed.collectionSaleIdents.map(String).slice(-500)
        : [],
    }
  } catch {
    return emptyStore()
  }
}

async function writeStore(env: Env, store: StoreFile) {
  await env.STORE.put(STORE_KEY, JSON.stringify(store))
}

function recordsFor(store: StoreFile, uuid: string, username: string) {
  const id = uuidKey(uuid)
  const name = nameKey(username)
  const matches: OwnedRecord[] = []
  if (id && store.byUuid[id]) matches.push(store.byUuid[id])
  if (name && store.byName[name]) matches.push(store.byName[name])
  if (name) {
    for (const record of Object.values(store.byUuid)) {
      if (nameKey(record.username) === name) matches.push(record)
    }
  }
  return matches
}

function lookup(store: StoreFile, uuid: string, username: string): OwnedRecord {
  const matches = recordsFor(store, uuid, username)
  return {
    uuid: matches.find((record) => uuidKey(record.uuid))?.uuid || uuid,
    username: matches.find((record) => nameKey(record.username))?.username || username,
    ownedCapeIds: [...new Set([...matches.flatMap((record) => record.ownedCapeIds || []), ...freeCapeIds()])],
    collection: matches.some((record) => record.collection),
  }
}

function persistRecord(store: StoreFile, record: OwnedRecord) {
  const id = uuidKey(record.uuid)
  const name = nameKey(record.username)
  if (id) store.byUuid[id] = record
  if (name) {
    store.byName[name] = record
    for (const [key, existing] of Object.entries(store.byUuid)) {
      if (nameKey(existing.username) === name) {
        store.byUuid[key] = { ...record, uuid: existing.uuid || record.uuid }
      }
    }
  }
}

async function grant(env: Env, body: Partial<OwnedRecord>) {
  const store = await readStore(env)
  const previous = lookup(store, body.uuid || '', body.username || '')
  const record: OwnedRecord = {
    uuid: previous.uuid || String(body.uuid || ''),
    username: String(body.username || previous.username || ''),
    ownedCapeIds: [
      ...new Set([
        ...previous.ownedCapeIds,
        ...knownCapeIds(Array.isArray(body.ownedCapeIds) ? body.ownedCapeIds.map(String) : []),
      ]),
    ],
    collection: Boolean(body.collection || previous.collection),
  }
  if (isFullCollection(record.ownedCapeIds)) record.collection = true
  persistRecord(store, record)
  await writeStore(env, store)
  return record
}

async function revoke(env: Env, username: string, capeIds: string[], ownedCapeIds?: string[]) {
  const store = await readStore(env)
  const previous = lookup(store, '', username)
  const remove = new Set(capeIds.map(String))
  const start =
    Array.isArray(ownedCapeIds) && ownedCapeIds.length > 0
      ? ownedCapeIds.map(String)
      : previous.ownedCapeIds
  const record: OwnedRecord = {
    uuid: previous.uuid,
    username: previous.username || username,
    ownedCapeIds: [...new Set(start.filter((id) => !remove.has(id)))],
    collection: false,
  }
  persistRecord(store, record)
  await writeStore(env, store)
  return record
}

async function listPlayers(env: Env) {
  const store = await readStore(env)
  const seen = new Set<string>()
  const players: OwnedRecord[] = []
  for (const record of [...Object.values(store.byName), ...Object.values(store.byUuid)]) {
    const merged = lookup(store, record.uuid, record.username)
    const key = nameKey(merged.username) || uuidKey(merged.uuid)
    if (!key || seen.has(key)) continue
    seen.add(key)
    players.push(merged)
  }
  return players.sort((a, b) => a.username.localeCompare(b.username))
}

function collectionStock(store: StoreFile, limit: number) {
  const cap = limit > 0 ? limit : 100
  const sold = Math.min(store.collectionSold, cap)
  return { limit: cap, sold, remaining: Math.max(0, cap - sold) }
}

async function recordVerifiedCollectionSale(env: Env, ident: string, limit: number) {
  const store = await readStore(env)
  const key = ident.trim()
  if (!key || store.collectionSaleIdents.includes(key)) {
    return { ...collectionStock(store, limit), recorded: false }
  }
  store.collectionSold += 1
  store.collectionSaleIdents = [...store.collectionSaleIdents, key].slice(-500)
  await writeStore(env, store)
  return { ...collectionStock(store, limit), recorded: true }
}

async function fetchPaidBasket(ident: string, publicToken: string): Promise<TebexBasket | null> {
  if (!ident || !publicToken) return null
  const response = await fetch(
    `https://headless.tebex.io/api/accounts/${encodeURIComponent(publicToken)}/baskets/${encodeURIComponent(ident)}`,
    { headers: { Accept: 'application/json' } },
  )
  if (!response.ok) return null
  const body = (await response.json()) as { data?: TebexBasket } & TebexBasket
  return body.data || body
}

async function validSession(env: Env, token: string) {
  if (!token) return false
  const expires = Number(await env.STORE.get(`session:${token}`))
  if (!expires || expires < Date.now()) {
    if (token) await env.STORE.delete(`session:${token}`)
    return false
  }
  return true
}

export default {
  async fetch(request: Request, env: Env) {
    const origin = request.headers.get('Origin')
    const url = new URL(request.url)
    const pathname = normalizePath(url.pathname)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    const adminPassword = env.ADMIN_PASSWORD || ''
    const tebexPublicToken = env.TEBEX_PUBLIC_TOKEN || ''
    const tebexWebhookSecret = env.TEBEX_WEBHOOK_SECRET || ''
    const collectionSlug = env.COLLECTION_SLUG || 'collection'
    const collectionLimit = Math.max(1, Number(env.COLLECTION_LIMIT || 100) || 100)
    const ip = clientIp(request)

    const parseBody = async () => {
      const raw = await request.text()
      if (!raw.trim()) return {} as Record<string, unknown>
      try {
        const value = JSON.parse(raw) as unknown
        return value && typeof value === 'object' && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : null
      } catch {
        return null
      }
    }

    if (pathname === '/api/webhooks/tebex' && request.method === 'GET') {
      return json(200, { ok: true, endpoint: 'webhooks' }, origin)
    }

    if (pathname === '/api/webhooks/tebex' && request.method === 'POST') {
      const rawBody = await request.text()
      const inspected = await inspectTebexWebhook({
        rawBody,
        signature: request.headers.get('X-Signature') || '',
        ip,
        secret: tebexWebhookSecret,
      })
      if (inspected.kind === 'unauthorized') return json(401, { error: 'Invalid webhook signature.' }, origin)
      if (inspected.kind === 'invalid') return json(400, { error: 'Invalid webhook.' }, origin)
      if (inspected.kind === 'validation') return json(200, { id: inspected.id }, origin)
      if (inspected.kind === 'ignored') return json(200, { received: true, type: inspected.type }, origin)

      const packages = inspected.packages
      const granted = capeIdsFromPackages(packages, collectionSlug)
      let username = inspected.username
      let uuid = inspected.uuid
      if (USERNAME_RE.test(username)) {
        try {
          const account = await resolveMinecraftAccount(username)
          username = account.username
          uuid = account.uuid || uuid
        } catch {
          // Keep the checkout username if Mojang lookup is down.
        }
      }
      if (!USERNAME_RE.test(username) || granted.length === 0) {
        return json(200, { received: true, granted: [], complete: true }, origin)
      }
      const collection = isCollectionPackage(packages, collectionSlug) || isFullCollection(granted)
      const store = await readStore(env)
      const existing = lookup(store, uuid, username)
      const record = await grant(env, {
        username,
        uuid: existing.uuid || uuid,
        ownedCapeIds: granted,
        collection,
      })
      if (collection) await recordVerifiedCollectionSale(env, inspected.transactionId, collectionLimit)
      return json(200, { ...record, complete: true, granted }, origin)
    }

    if (pathname === '/api/collection-stock' && request.method === 'GET') {
      const store = await readStore(env)
      return json(200, collectionStock(store, collectionLimit), origin)
    }

    if (pathname === '/api/collection-sale' && request.method === 'POST') {
      const body = await parseBody()
      if (!body) return json(400, { error: 'Invalid JSON.' }, origin)
      const ident = String(body.ident || '').trim()
      if (!IDENT_RE.test(ident)) return json(400, { error: 'Missing checkout id.' }, origin)
      const basket = await fetchPaidBasket(ident, tebexPublicToken)
      const paid = Boolean(basket?.complete && isCollectionPackage(basket.packages || [], collectionSlug))
      if (!paid) {
        const store = await readStore(env)
        return json(200, { ...collectionStock(store, collectionLimit), recorded: false }, origin)
      }
      return json(200, await recordVerifiedCollectionSale(env, ident, collectionLimit), origin)
    }

    if (pathname === '/api/admin/login' && request.method === 'POST') {
      if (!adminPassword || adminPassword.length < 8) {
        return json(503, { error: 'Admin password is not configured on this server.' }, origin)
      }
      if (limited(loginAttempts, ip, 8, 10 * 60 * 1000)) {
        return json(429, { error: 'Too many login attempts. Try again in a few minutes.' }, origin)
      }
      const body = await parseBody()
      if (!body) return json(400, { error: 'Invalid JSON.' }, origin)
      const password = String(body.password || '')
      if (!(await passwordsMatch(password, adminPassword))) {
        return json(401, { error: 'Wrong password.' }, origin)
      }
      const token = randomToken()
      await env.STORE.put(`session:${token}`, String(Date.now() + SESSION_MS), {
        expirationTtl: Math.floor(SESSION_MS / 1000),
      })
      return json(200, { ok: true, token }, origin)
    }

    if (pathname === '/api/admin/logout' && request.method === 'POST') {
      const token = bearerToken(request)
      if (token) await env.STORE.delete(`session:${token}`)
      return json(200, { ok: true }, origin)
    }

    if (pathname === '/api/admin/players' && request.method === 'GET') {
      if (!(await validSession(env, bearerToken(request)))) {
        return json(401, { error: 'Admin login required.' }, origin)
      }
      return json(200, { players: await listPlayers(env) }, origin)
    }

    if (pathname === '/api/admin/grant' && request.method === 'POST') {
      if (!(await validSession(env, bearerToken(request)))) {
        return json(401, { error: 'Admin login required.' }, origin)
      }
      if (limited(adminAttempts, ip, 40, 10 * 60 * 1000)) {
        return json(429, { error: 'Too many admin requests. Try again in a few minutes.' }, origin)
      }
      const body = await parseBody()
      if (!body) return json(400, { error: 'Invalid JSON.' }, origin)
      const username = String(body.username || '').trim()
      let account
      try {
        account = await resolveMinecraftAccount(username)
      } catch (error) {
        return json(
          400,
          { error: error instanceof Error ? error.message : INVALID_MINECRAFT_ACCOUNT },
          origin,
        )
      }
      const capeIds = knownCapeIds(Array.isArray(body.capeIds) ? body.capeIds.map(String) : [])
      const store = await readStore(env)
      const existing = lookup(store, account.uuid, account.username)
      const record = await grant(env, {
        username: account.username,
        uuid: existing.uuid || account.uuid,
        ownedCapeIds: capeIds,
        collection: Boolean(body.collection) || isFullCollection(capeIds),
      })
      return json(200, record, origin)
    }

    if (pathname === '/api/admin/revoke' && request.method === 'POST') {
      if (!(await validSession(env, bearerToken(request)))) {
        return json(401, { error: 'Admin login required.' }, origin)
      }
      if (limited(adminAttempts, ip, 40, 10 * 60 * 1000)) {
        return json(429, { error: 'Too many admin requests. Try again in a few minutes.' }, origin)
      }
      const body = await parseBody()
      if (!body) return json(400, { error: 'Invalid JSON.' }, origin)
      const username = String(body.username || '').trim()
      if (!USERNAME_RE.test(username)) {
        return json(400, { error: 'Enter a valid Java Edition username.' }, origin)
      }
      const capeIds = knownCapeIds(Array.isArray(body.capeIds) ? body.capeIds.map(String) : [])
      if (capeIds.length === 0) {
        return json(400, { error: 'Select at least one cloak to remove.' }, origin)
      }
      const store = await readStore(env)
      const existing = lookup(store, '', username)
      const extra = Array.isArray(body.ownedCapeIds) ? body.ownedCapeIds.map(String) : []
      const record = await revoke(
        env,
        username,
        capeIds,
        extra.length ? extra : existing.collection ? existing.ownedCapeIds : undefined,
      )
      return json(200, record, origin)
    }

    if (pathname === '/api/cosmetics/claim' && request.method === 'POST') {
      if (limited(claimAttempts, ip, 20, 10 * 60 * 1000)) {
        return json(429, { error: 'Too many claim attempts. Try again in a few minutes.' }, origin)
      }
      const body = await parseBody()
      if (!body) return json(400, { error: 'Invalid JSON.' }, origin)
      const ident = String(body.ident || '').trim()
      if (!IDENT_RE.test(ident)) return json(400, { error: 'Missing checkout id.' }, origin)
      const basket = await fetchPaidBasket(ident, tebexPublicToken)
      if (!basket?.complete) {
        return json(409, { complete: false, granted: [], error: 'Payment is not complete yet.' }, origin)
      }
      const packages = Array.isArray(basket.packages) ? basket.packages : []
      const granted = capeIdsFromPackages(packages, collectionSlug)
      if (granted.length === 0) {
        return json(400, { complete: true, granted: [], error: 'No cloaks were on this payment.' }, origin)
      }
      const basketName = String(basket.username || '').trim()
      const bodyName = String(body.username || '').trim()
      const username = USERNAME_RE.test(basketName)
        ? basketName
        : USERNAME_RE.test(bodyName)
          ? bodyName
          : ''
      if (!username) {
        return json(400, {
          complete: true,
          granted,
          error: 'Link a Minecraft account so this payment can be assigned.',
        }, origin)
      }
      if (
        USERNAME_RE.test(basketName) &&
        USERNAME_RE.test(bodyName) &&
        nameKey(basketName) !== nameKey(bodyName)
      ) {
        return json(403, {
          complete: true,
          granted: [],
          error: 'This payment belongs to a different Minecraft account.',
        }, origin)
      }
      const store = await readStore(env)
      const uuid = uuidKey(String(body.uuid || ''))
        ? String(body.uuid || '')
        : lookup(store, '', username).uuid
      const collection = isCollectionPackage(packages, collectionSlug) || isFullCollection(granted)
      const record = await grant(env, { username, uuid, ownedCapeIds: granted, collection })
      if (collection) await recordVerifiedCollectionSale(env, ident, collectionLimit)
      return json(200, { ...record, complete: true, granted }, origin)
    }

    if (
      (pathname === '/api/cosmetics/grant' || pathname === '/api/cosmetics' || pathname === '/v1/cosmetics') &&
      request.method === 'POST'
    ) {
      return json(403, { error: 'Cloaks are granted after a verified payment or by an admin.' }, origin)
    }

    if (
      (pathname === '/api/cosmetics/owned' ||
        pathname === '/api/cosmetics' ||
        pathname === '/v1/cosmetics' ||
        pathname === '/api/v1/cosmetics' ||
        pathname === '/api/v1/cosmetics/owned') &&
      request.method === 'GET'
    ) {
      const username = url.searchParams.get('username') || ''
      const uuid = url.searchParams.get('uuid') || ''
      if (username && !USERNAME_RE.test(username)) {
        return json(400, { error: 'Enter a valid Java Edition username.' }, origin)
      }
      const store = await readStore(env)
      return json(200, lookup(store, uuid, username), origin)
    }

    return json(404, { error: 'Not found.' }, origin)
  },
}
