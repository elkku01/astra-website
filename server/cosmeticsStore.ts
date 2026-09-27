import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import {
  capeIdsFromPackages,
  isCollectionPackage,
  isFullCollection,
  knownCapeIds,
} from '../src/store/fulfillment.ts'

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

const DATA_FILE = path.resolve('.data/cosmetics-owned.json')
const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/
const IDENT_RE = /^[A-Za-z0-9._-]{6,128}$/
const ADMIN_COOKIE = 'astra_admin'
const SESSION_MS = 4 * 60 * 60 * 1000
const MAX_BODY = 32 * 1024
const sessions = new Map<string, number>()
const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const adminAttempts = new Map<string, { count: number; resetAt: number }>()
const claimAttempts = new Map<string, { count: number; resetAt: number }>()

function emptyStore(): StoreFile {
  return { byUuid: {}, byName: {}, collectionSold: 0, collectionSaleIdents: [] }
}

function uuidKey(uuid = ''): string {
  const hex = uuid.replace(/-/g, '').toLowerCase()
  return /^[0-9a-f]{32}$/.test(hex) ? hex : ''
}

function nameKey(username = ''): string {
  return username.trim().toLowerCase()
}

function readStore(): StoreFile {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8')
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

function writeStore(store: StoreFile) {
  const json = JSON.stringify(store, null, 2)
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true })
  fs.writeFileSync(DATA_FILE, json, 'utf8')
  const appData = process.env.APPDATA
  if (appData) {
    const shared = path.join(appData, 'AstraLauncher', 'cosmetics-owned.json')
    fs.mkdirSync(path.dirname(shared), { recursive: true })
    fs.writeFileSync(shared, json, 'utf8')
  }
}

function recordsFor(store: StoreFile, uuid: string, username: string): OwnedRecord[] {
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
    ownedCapeIds: [...new Set(matches.flatMap((record) => record.ownedCapeIds || []))],
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

function grant(body: Partial<OwnedRecord>): OwnedRecord {
  const store = readStore()
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
  writeStore(store)
  return record
}

function revoke(username: string, capeIds: string[], ownedCapeIds?: string[]): OwnedRecord {
  const store = readStore()
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
  writeStore(store)
  return record
}

function listPlayers(): OwnedRecord[] {
  const store = readStore()
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

function collectionStock(limit: number) {
  const store = readStore()
  const cap = limit > 0 ? limit : 100
  const sold = Math.min(store.collectionSold, cap)
  return {
    limit: cap,
    sold,
    remaining: Math.max(0, cap - sold),
  }
}

function recordVerifiedCollectionSale(ident: string, limit: number) {
  const store = readStore()
  const key = ident.trim()
  if (!key || store.collectionSaleIdents.includes(key)) {
    return { ...collectionStock(limit), recorded: false }
  }
  store.collectionSold += 1
  store.collectionSaleIdents = [...store.collectionSaleIdents, key].slice(-500)
  writeStore(store)
  return { ...collectionStock(limit), recorded: true }
}

function send(res: ServerResponse, status: number, body: unknown, cookie?: string) {
  const json = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (cookie) res.setHeader('Set-Cookie', cookie)
  res.end(json)
}

function adminCookie(token: string | null): string {
  if (!token) {
    return `${ADMIN_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`
  }
  return `${ADMIN_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_MS / 1000)}`
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buf.length
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('payload-too-large'), { code: 'PAYLOAD' }))
        req.destroy()
        return
      }
      chunks.push(buf)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function parseJson(raw: string): Record<string, unknown> | null {
  if (!raw.trim()) return {}
  try {
    const value = JSON.parse(raw) as unknown
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

function passwordsMatch(given: string, expected: string): boolean {
  return timingSafeEqual(digest(given), digest(expected))
}

function clientIp(req: IncomingMessage): string {
  return String(req.socket.remoteAddress || 'unknown')
}

function limited(
  table: Map<string, { count: number; resetAt: number }>,
  ip: string,
  max: number,
  windowMs: number,
): boolean {
  const now = Date.now()
  const current = table.get(ip)
  if (!current || current.resetAt < now) {
    table.set(ip, { count: 1, resetAt: now + windowMs })
    return false
  }
  current.count += 1
  return current.count > max
}

function bearerToken(req: IncomingMessage): string {
  const header = String(req.headers.authorization || '')
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

function cookieToken(req: IncomingMessage): string {
  const raw = String(req.headers.cookie || '')
  const match = raw.match(/(?:^|;\s*)astra_admin=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

function validSession(token: string): boolean {
  if (!token) return false
  const expires = sessions.get(token)
  if (!expires) return false
  if (expires < Date.now()) {
    sessions.delete(token)
    return false
  }
  return true
}

function hasAdminSession(req: IncomingMessage): boolean {
  return validSession(cookieToken(req) || bearerToken(req))
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

function isStorePath(url: string): boolean {
  const pathname = url.split('?')[0]
  return (
    pathname === '/api/cosmetics' ||
    pathname === '/api/cosmetics/' ||
    pathname === '/api/cosmetics/owned' ||
    pathname === '/api/cosmetics/grant' ||
    pathname === '/api/cosmetics/claim' ||
    pathname === '/v1/cosmetics' ||
    pathname === '/api/admin/login' ||
    pathname === '/api/admin/logout' ||
    pathname === '/api/admin/players' ||
    pathname === '/api/admin/grant' ||
    pathname === '/api/admin/revoke' ||
    pathname === '/api/collection-stock' ||
    pathname === '/api/collection-sale'
  )
}

export function cosmeticsStoreApi(
  options: {
    adminPassword?: string
    tebexPublicToken?: string
    collectionSlug?: string
    collectionLimit?: number
  } = {},
): Plugin {
  const adminPassword = options.adminPassword || ''
  const tebexPublicToken = options.tebexPublicToken || ''
  const collectionSlug = options.collectionSlug || 'collection'
  const collectionLimit =
    options.collectionLimit && options.collectionLimit > 0 ? options.collectionLimit : 100
  return {
    name: 'astra-cosmetics-store',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          if (
            await handle(req, res, {
              adminPassword,
              tebexPublicToken,
              collectionSlug,
              collectionLimit,
            })
          ) {
            return
          }
        } catch (error) {
          const payload = error instanceof Error && error.message === 'payload-too-large'
          send(res, payload ? 413 : 500, {
            error: payload ? 'Request is too large.' : 'store-error',
          })
          return
        }
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          if (
            await handle(req, res, {
              adminPassword,
              tebexPublicToken,
              collectionSlug,
              collectionLimit,
            })
          ) {
            return
          }
        } catch (error) {
          const payload = error instanceof Error && error.message === 'payload-too-large'
          send(res, payload ? 413 : 500, {
            error: payload ? 'Request is too large.' : 'store-error',
          })
          return
        }
        next()
      })
    },
  }
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  options: {
    adminPassword: string
    tebexPublicToken: string
    collectionSlug: string
    collectionLimit: number
  },
): Promise<boolean> {
  const { adminPassword, tebexPublicToken, collectionSlug, collectionLimit } = options
  const url = req.url || '/'
  if (!isStorePath(url)) return false
  if (req.method === 'OPTIONS') {
    send(res, 204, {})
    return true
  }
  const pathname = url.split('?')[0]
  const ip = clientIp(req)

  if (pathname === '/api/collection-stock' && req.method === 'GET') {
    send(res, 200, collectionStock(collectionLimit))
    return true
  }

  if (pathname === '/api/collection-sale' && req.method === 'POST') {
    const body = parseJson(await readBody(req))
    if (!body) {
      send(res, 400, { error: 'Invalid JSON.' })
      return true
    }
    const ident = String(body.ident || '').trim()
    if (!IDENT_RE.test(ident)) {
      send(res, 400, { error: 'Missing checkout id.' })
      return true
    }
    const basket = await fetchPaidBasket(ident, tebexPublicToken)
    const paid = Boolean(basket?.complete && isCollectionPackage(basket.packages || [], collectionSlug))
    if (!paid) {
      send(res, 200, { ...collectionStock(collectionLimit), recorded: false })
      return true
    }
    send(res, 200, recordVerifiedCollectionSale(ident, collectionLimit))
    return true
  }

  if (pathname === '/api/admin/login' && req.method === 'POST') {
    if (!adminPassword || adminPassword.length < 8) {
      send(res, 503, { error: 'Admin password is not configured on this server.' })
      return true
    }
    if (limited(loginAttempts, ip, 8, 10 * 60 * 1000)) {
      send(res, 429, { error: 'Too many login attempts. Try again in a few minutes.' })
      return true
    }
    const body = parseJson(await readBody(req))
    if (!body) {
      send(res, 400, { error: 'Invalid JSON.' })
      return true
    }
    const password = String(body.password || '')
    if (!passwordsMatch(password, adminPassword)) {
      send(res, 401, { error: 'Wrong password.' })
      return true
    }
    const token = randomBytes(32).toString('hex')
    sessions.set(token, Date.now() + SESSION_MS)
    send(res, 200, { ok: true }, adminCookie(token))
    return true
  }

  if (pathname === '/api/admin/logout' && req.method === 'POST') {
    sessions.delete(cookieToken(req) || bearerToken(req))
    send(res, 200, { ok: true }, adminCookie(null))
    return true
  }

  if (pathname === '/api/admin/players' && req.method === 'GET') {
    if (!hasAdminSession(req)) {
      send(res, 401, { error: 'Admin login required.' })
      return true
    }
    send(res, 200, { players: listPlayers() })
    return true
  }

  if (pathname === '/api/admin/grant' && req.method === 'POST') {
    if (!hasAdminSession(req)) {
      send(res, 401, { error: 'Admin login required.' })
      return true
    }
    if (limited(adminAttempts, ip, 40, 10 * 60 * 1000)) {
      send(res, 429, { error: 'Too many admin requests. Try again in a few minutes.' })
      return true
    }
    const body = parseJson(await readBody(req))
    if (!body) {
      send(res, 400, { error: 'Invalid JSON.' })
      return true
    }
    const username = String(body.username || '').trim()
    if (!USERNAME_RE.test(username)) {
      send(res, 400, { error: 'Enter a valid Java Edition username.' })
      return true
    }
    const capeIds = knownCapeIds(Array.isArray(body.capeIds) ? body.capeIds.map(String) : [])
    const existing = lookup(readStore(), '', username)
    const record = grant({
      username,
      uuid: existing.uuid,
      ownedCapeIds: capeIds,
      collection: Boolean(body.collection) || isFullCollection(capeIds),
    })
    send(res, 200, record)
    return true
  }

  if (pathname === '/api/admin/revoke' && req.method === 'POST') {
    if (!hasAdminSession(req)) {
      send(res, 401, { error: 'Admin login required.' })
      return true
    }
    if (limited(adminAttempts, ip, 40, 10 * 60 * 1000)) {
      send(res, 429, { error: 'Too many admin requests. Try again in a few minutes.' })
      return true
    }
    const body = parseJson(await readBody(req))
    if (!body) {
      send(res, 400, { error: 'Invalid JSON.' })
      return true
    }
    const username = String(body.username || '').trim()
    if (!USERNAME_RE.test(username)) {
      send(res, 400, { error: 'Enter a valid Java Edition username.' })
      return true
    }
    const capeIds = knownCapeIds(Array.isArray(body.capeIds) ? body.capeIds.map(String) : [])
    if (capeIds.length === 0) {
      send(res, 400, { error: 'Select at least one cloak to remove.' })
      return true
    }
    const existing = lookup(readStore(), '', username)
    const extra = Array.isArray(body.ownedCapeIds) ? body.ownedCapeIds.map(String) : []
    const record = revoke(
      username,
      capeIds,
      extra.length ? extra : existing.collection ? existing.ownedCapeIds : undefined,
    )
    send(res, 200, record)
    return true
  }

  if (pathname === '/api/cosmetics/claim' && req.method === 'POST') {
    if (limited(claimAttempts, ip, 20, 10 * 60 * 1000)) {
      send(res, 429, { error: 'Too many claim attempts. Try again in a few minutes.' })
      return true
    }
    const body = parseJson(await readBody(req))
    if (!body) {
      send(res, 400, { error: 'Invalid JSON.' })
      return true
    }
    const ident = String(body.ident || '').trim()
    if (!IDENT_RE.test(ident)) {
      send(res, 400, { error: 'Missing checkout id.' })
      return true
    }
    const basket = await fetchPaidBasket(ident, tebexPublicToken)
    if (!basket?.complete) {
      send(res, 409, { complete: false, granted: [], error: 'Payment is not complete yet.' })
      return true
    }
    const packages = Array.isArray(basket.packages) ? basket.packages : []
    const granted = capeIdsFromPackages(packages, collectionSlug)
    if (granted.length === 0) {
      send(res, 400, { complete: true, granted: [], error: 'No cloaks were on this payment.' })
      return true
    }
    const basketName = String(basket.username || '').trim()
    const bodyName = String(body.username || '').trim()
    const username = USERNAME_RE.test(basketName)
      ? basketName
      : USERNAME_RE.test(bodyName)
        ? bodyName
        : ''
    if (!username) {
      send(res, 400, {
        complete: true,
        granted,
        error: 'Link a Minecraft account so this payment can be assigned.',
      })
      return true
    }
    if (USERNAME_RE.test(basketName) && USERNAME_RE.test(bodyName) && nameKey(basketName) !== nameKey(bodyName)) {
      send(res, 403, {
        complete: true,
        granted: [],
        error: 'This payment belongs to a different Minecraft account.',
      })
      return true
    }
    const uuid = uuidKey(String(body.uuid || '')) ? String(body.uuid || '') : lookup(readStore(), '', username).uuid
    const collection = isCollectionPackage(packages, collectionSlug) || isFullCollection(granted)
    const record = grant({
      username,
      uuid,
      ownedCapeIds: granted,
      collection,
    })
    if (collection) recordVerifiedCollectionSale(ident, collectionLimit)
    send(res, 200, { ...record, complete: true, granted })
    return true
  }

  if (
    (pathname === '/api/cosmetics/grant' || pathname === '/api/cosmetics' || pathname === '/v1/cosmetics') &&
    req.method === 'POST'
  ) {
    send(res, 403, {
      error: 'Cloaks are granted after a verified payment or by an admin.',
    })
    return true
  }

  const parsed = new URL(url, 'http://127.0.0.1')
  if (req.method === 'GET') {
    const username = parsed.searchParams.get('username') || ''
    const uuid = parsed.searchParams.get('uuid') || ''
    if (username && !USERNAME_RE.test(username)) {
      send(res, 400, { error: 'Enter a valid Java Edition username.' })
      return true
    }
    send(res, 200, lookup(readStore(), uuid, username))
    return true
  }
  send(res, 405, { error: 'method-not-allowed' })
  return true
}
