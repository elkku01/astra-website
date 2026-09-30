import { CAPES, COLLECTION_LAUNCH_PRICE, freeCapeIds, paidCapes } from './capes'
import { fetchCheckoutStatus } from './checkout'
import { storeApiUrl } from './storeApi'
import { resolveMinecraftAccount, USERNAME_RE } from './minecraftAccount'

const SESSION_KEY = 'astra-capes-session'

export type StoreUser = {
  username: string
  uuid: string
  skinUrl?: string
  ownedCapeIds: string[]
  collection: boolean
  ownedWingIds?: string[]
}

type Session = StoreUser & { token?: string }

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Session
    if (!parsed?.username || !USERNAME_RE.test(parsed.username)) return null
    return {
      username: parsed.username,
      uuid: typeof parsed.uuid === 'string' ? parsed.uuid : '',
      skinUrl: httpsTextureUrl(parsed.skinUrl),
      ownedCapeIds: Array.isArray(parsed.ownedCapeIds)
        ? parsed.ownedCapeIds.filter((id) => CAPES.some((cape) => cape.id === id))
        : [],
      collection: Boolean(parsed.collection),
      ownedWingIds: Array.isArray(parsed.ownedWingIds) ? parsed.ownedWingIds.filter((id) => typeof id === 'string') : [],
      token: typeof parsed.token === 'string' ? parsed.token : undefined,
    }
  } catch {
    return null
  }
}

function writeSession(session: Session | null) {
  if (!session) localStorage.removeItem(SESSION_KEY)
  else {
    const safe: Session = {
      username: session.username,
      uuid: session.uuid,
      skinUrl: httpsTextureUrl(session.skinUrl),
      ownedCapeIds: session.ownedCapeIds,
      collection: session.collection,
      ownedWingIds: session.ownedWingIds || [],
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(safe))
  }
}

function withCollection(user: StoreUser): StoreUser {
  const owned = [...new Set([...user.ownedCapeIds, ...freeCapeIds()])]
  const paid = paidCapes()
  const collection = user.collection || paid.every((cape) => owned.includes(cape.id))
  return {
    ...user,
    collection,
    skinUrl: httpsTextureUrl(user.skinUrl),
    ownedCapeIds: collection ? CAPES.map((cape) => cape.id) : owned,
  }
}

export function collectionPrice(): number {
  return COLLECTION_LAUNCH_PRICE
}

export function getSession(): Session | null {
  return readSession()
}

export function formatUuid(raw: string): string {
  const hex = raw.replace(/-/g, '').toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(hex)) return raw
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const TEXTURE_RE = /^https:\/\/textures\.minecraft\.net\/texture\/[a-f0-9]+$/i

export function httpsTextureUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined
  const url = raw.replace(/^http:\/\//i, 'https://')
  return TEXTURE_RE.test(url) ? url : undefined
}

function uuidHex(uuid = ''): string {
  const hex = formatUuid(uuid).replace(/-/g, '').toLowerCase()
  return /^[0-9a-f]{32}$/.test(hex) ? hex : ''
}

export function avatarUrl(username: string, size = 64, uuid = ''): string {
  const id = uuidHex(uuid) || username
  return `https://mc-heads.net/avatar/${encodeURIComponent(id)}/${size}`
}

export function skinSources(username: string, uuid = '', textureUrl = ''): string[] {
  const urls: string[] = []
  const official = httpsTextureUrl(textureUrl)
  if (official) urls.push(official)
  const hex = uuidHex(uuid)
  if (hex) {
    urls.push(`https://mc-heads.net/skin/${hex}`)
    urls.push(`https://minotar.net/skin/${hex}`)
  }
  if (username) {
    urls.push(`https://mc-heads.net/skin/${encodeURIComponent(username)}`)
    urls.push(`https://minotar.net/skin/${encodeURIComponent(username)}`)
  }
  return [...new Set(urls)]
}

type Profile = { username: string; uuid: string; skinUrl?: string }

async function fetchJson(url: string, timeoutMs = 7000): Promise<unknown> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (response.status === 404) throw new Error('not-found')
    if (!response.ok) throw new Error('fail')
    return await response.json()
  } finally {
    window.clearTimeout(timer)
  }
}

async function lookupMinecraft(username: string): Promise<Profile> {
  const account = await resolveMinecraftAccount(username)
  try {
    const body = (await fetchJson(
      `https://api.ashcon.app/mojang/v2/user/${encodeURIComponent(account.username)}`,
    )) as { textures?: { skin?: { url?: string } } }
    return { ...account, skinUrl: httpsTextureUrl(body.textures?.skin?.url) }
  } catch {
    return account
  }
}

function ownedFromBody(body: { ownedCapeIds?: unknown; collection?: unknown; ownedWingIds?: unknown }): {
  ownedCapeIds: string[]
  collection: boolean
  ownedWingIds: string[]
} {
  const ownedCapeIds = Array.isArray(body.ownedCapeIds)
    ? body.ownedCapeIds.filter((id): id is string => typeof id === 'string')
    : []
  const ownedWingIds = Array.isArray(body.ownedWingIds)
    ? body.ownedWingIds.filter((id): id is string => typeof id === 'string')
    : []
  return { ownedCapeIds, collection: body.collection === true, ownedWingIds }
}

async function fetchOwnedFromStore(uuid: string, username: string): Promise<{
  ownedCapeIds: string[]
  collection: boolean
  ownedWingIds: string[]
} | null> {
  const query = new URLSearchParams()
  if (uuid) query.set('uuid', uuid)
  if (username) query.set('username', username)
  // The store API is the only source of truth for ownership.
  try {
    const body = (await fetchJson(storeApiUrl(`/api/cosmetics/owned?${query}`), 6000)) as {
      ownedCapeIds?: unknown
      collection?: unknown
      ownedWingIds?: unknown
    }
    return ownedFromBody(body)
  } catch (error) {
    console.warn('Could not load owned cloaks from the store API.', error)
    return null
  }
}

export async function loginWithUsername(username: string): Promise<StoreUser> {
  const profile = await lookupMinecraft(username)
  const existing = readSession()
  const same =
    existing && existing.username.toLowerCase() === profile.username.toLowerCase()
      ? existing
      : null
  const remote = await fetchOwnedFromStore(profile.uuid, profile.username)
  const user = withCollection({
    username: profile.username,
    uuid: profile.uuid,
    skinUrl: profile.skinUrl || same?.skinUrl,
    // The server answer replaces the cached list, so revoked cloaks disappear.
    ownedCapeIds: remote ? remote.ownedCapeIds : same?.ownedCapeIds || [],
    collection: remote ? remote.collection : Boolean(same?.collection),
    ownedWingIds: remote ? remote.ownedWingIds : same?.ownedWingIds || [],
  })
  writeSession(user)
  return user
}

export async function validateStoreToken(token: string): Promise<StoreUser> {
  const value = token.trim()
  if (!value) throw new Error('Missing token')

  if (import.meta.env.VITE_STORE_API) {
    const response = await fetch(storeApiUrl('/api/auth'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token: value }),
    })
    if (!response.ok) throw new Error('Invalid or expired token')
    return withCollection((await response.json()) as StoreUser)
  }

  if (import.meta.env.DEV && (value === 'demo' || value === 'astra_demo')) {
    return loginWithUsername('jeb_')
  }

  throw new Error('Store tokens require the Astra backend. Link with your Minecraft username instead.')
}

export async function loginWithToken(token: string): Promise<StoreUser> {
  const user = await validateStoreToken(token)
  writeSession(user)
  return user
}

export function logoutStore() {
  writeSession(null)
}

export type PurchaseResult = {
  user: StoreUser | null
  complete: boolean
  granted: string[]
}

export async function applyRemoteOwned(username?: string): Promise<StoreUser | null> {
  const session = readSession()
  if (!session) return null
  if (username && session.username.toLowerCase() !== username.trim().toLowerCase()) {
    return session
  }
  const remote = await fetchOwnedFromStore(session.uuid, session.username)
  if (!remote) return session
  const next = withCollection({
    ...session,
    ownedCapeIds: remote.ownedCapeIds,
    collection: remote.collection,
    ownedWingIds: remote.ownedWingIds,
  })
  writeSession(next)
  return next
}

export function ownsCape(user: StoreUser | null, capeId: string): boolean {
  if (!user) return false
  return user.collection || user.ownedCapeIds.includes(capeId)
}

/**
 * Confirms a Stripe checkout after the redirect back. The store API grants the
 * cloaks (from Stripe's webhook, or by checking with Stripe here); this only
 * reads the result and refreshes the owned list from the server.
 */
export async function applyCheckoutSession(sessionId?: string): Promise<PurchaseResult> {
  const session = readSession()
  if (!sessionId) return { user: session, complete: false, granted: [] }
  const status = await fetchCheckoutStatus(sessionId)
  if (!status.complete) return { user: session, complete: false, granted: [] }
  const username = status.username || session?.username || ''
  if (!username) return { user: session, complete: true, granted: status.granted }
  const remote = await fetchOwnedFromStore(status.uuid || '', username)
  const same = session && session.username.toLowerCase() === username.toLowerCase() ? session : null
  const next = withCollection({
    username,
    uuid: status.uuid || same?.uuid || '',
    skinUrl: same?.skinUrl,
    ownedCapeIds: remote ? remote.ownedCapeIds : [...new Set([...(same?.ownedCapeIds || []), ...status.granted])],
    collection: remote ? remote.collection : Boolean(same?.collection),
    ownedWingIds: remote ? remote.ownedWingIds : same?.ownedWingIds || [],
  })
  writeSession(next)
  return { user: next, complete: true, granted: status.granted }
}

export function storeHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base}store`.replace(/([^:/])\/{2,}/g, '$1/')
}
