import { CAPES, COLLECTION_LAUNCH_PRICE, freeCapeIds, paidCapes } from './capes'
import { capeIdsFromBasket, clearPendingBasket, getTebexBasket, takePendingBasket } from './tebex'
import { recordCollectionSale } from './collectionStock'
import { isFullCollection } from './fulfillment'
import { storeApiUrl } from './storeApi'

const SESSION_KEY = 'astra-capes-session'

export type StoreUser = {
  username: string
  uuid: string
  skinUrl?: string
  ownedCapeIds: string[]
  collection: boolean
}

type Session = StoreUser & { token?: string }

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/

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

function asProfile(
  username?: string | null,
  uuid?: string | null,
  skinUrl?: string | null,
): Profile | null {
  if (!username || !USERNAME_RE.test(username) || !uuid) return null
  const formatted = formatUuid(uuid)
  if (formatted.replace(/-/g, '').length !== 32) return null
  return { username, uuid: formatted, skinUrl: httpsTextureUrl(skinUrl) }
}

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
  const name = username.trim()
  if (!USERNAME_RE.test(name)) throw new Error('Enter a valid Java Edition username (3–16 letters, numbers, or _).')

  const sources: Array<() => Promise<Profile | null>> = [
    async () => {
      const body = (await fetchJson(
        `https://playerdb.co/api/player/minecraft/${encodeURIComponent(name)}`,
      )) as {
        data?: {
          player?: { username?: string; id?: string; raw_id?: string; skin_texture?: string }
        }
      }
      const player = body.data?.player
      return asProfile(player?.username, player?.id || player?.raw_id, player?.skin_texture)
    },
    async () => {
      const body = (await fetchJson(
        `https://api.ashcon.app/mojang/v2/user/${encodeURIComponent(name)}`,
      )) as { username?: string; uuid?: string; textures?: { skin?: { url?: string } } }
      return asProfile(body.username, body.uuid, body.textures?.skin?.url)
    },
    async () => {
      const body = (await fetchJson(
        `https://api.minetools.eu/uuid/${encodeURIComponent(name)}`,
      )) as { id?: string | null; name?: string; status?: string }
      if (body.status === 'ERR' || !body.id) throw new Error('not-found')
      const profile = asProfile(body.name, body.id)
      if (!profile) return null
      try {
        const extra = (await fetchJson(
          `https://api.minetools.eu/profile/${profile.uuid.replace(/-/g, '')}`,
        )) as { decoded?: { textures?: { SKIN?: { url?: string } } } }
        return {
          ...profile,
          skinUrl: httpsTextureUrl(extra.decoded?.textures?.SKIN?.url) || profile.skinUrl,
        }
      } catch {
        return profile
      }
    },
  ]

  let missing = false
  for (const source of sources) {
    try {
      const profile = await source()
      if (profile) return profile
    } catch (error) {
      if (error instanceof Error && error.message === 'not-found') missing = true
    }
  }

  throw new Error(
    missing
      ? 'Could not find that Java Edition account. Check the spelling.'
      : 'Minecraft profile lookup is unavailable right now. Try again in a moment.',
  )
}

function ownedFromBody(
  body: {
    ownedCapeIds?: unknown
    owned?: unknown
    capeIds?: unknown
    collection?: unknown
    byUuid?: unknown
    byName?: unknown
  },
  uuid: string,
  username: string,
): { ownedCapeIds: string[]; collection: boolean } | null {
  const record = storeRecord(body, uuid, username)
  const source = record || body
  const raw = source.ownedCapeIds ?? source.owned ?? source.capeIds
  const ownedCapeIds = Array.isArray(raw)
    ? raw.filter((id): id is string => typeof id === 'string')
    : []
  const collection = Boolean(source.collection || body.collection)
  if (!record && ownedCapeIds.length === 0 && !collection && (body.byUuid || body.byName)) {
    return null
  }
  return { ownedCapeIds, collection }
}

function storeRecord(
  body: { byUuid?: unknown; byName?: unknown },
  uuid: string,
  username: string,
): { ownedCapeIds?: unknown; owned?: unknown; capeIds?: unknown; collection?: unknown; username?: unknown } | null {
  const hex = uuid.replace(/-/g, '').toLowerCase()
  const dashed = formatUuid(uuid).toLowerCase()
  if (body.byUuid && typeof body.byUuid === 'object') {
    const byUuid = body.byUuid as Record<
      string,
      { ownedCapeIds?: unknown; collection?: unknown; username?: unknown }
    >
    const match = byUuid[hex] || byUuid[dashed]
    if (match) return match
    const wanted = username.trim().toLowerCase()
    if (wanted) {
      for (const record of Object.values(byUuid)) {
        if (String(record?.username || '').trim().toLowerCase() === wanted) return record
      }
    }
  }
  if (username && body.byName && typeof body.byName === 'object') {
    const byName = body.byName as Record<string, { ownedCapeIds?: unknown; collection?: unknown }>
    return byName[username.trim().toLowerCase()] || null
  }
  return null
}

async function fetchOwnedFromStore(uuid: string, username: string): Promise<{
  ownedCapeIds: string[]
  collection: boolean
} | null> {
  const query = new URLSearchParams()
  if (uuid) query.set('uuid', uuid)
  if (username) query.set('username', username)
  const urls = [
    storeApiUrl(`/api/cosmetics/owned?${query}`),
    'https://elkku01.github.io/astra-website/api/cosmetics/owned?' + query.toString(),
    'https://elkku01.github.io/astra-website/cosmetics-owned.json',
  ]
  for (const url of urls) {
    try {
      const body = (await fetchJson(url, 4000)) as {
        ownedCapeIds?: unknown
        owned?: unknown
        capeIds?: unknown
        collection?: unknown
        byUuid?: unknown
        byName?: unknown
      }
      const parsed = ownedFromBody(body, uuid, username)
      if (parsed) return parsed
    } catch {
      // Local store API is optional until the production backend is live.
    }
  }
  return null
}

async function claimPurchase(
  ident: string,
  user: StoreUser | null,
): Promise<{
  ownedCapeIds: string[]
  collection: boolean
  granted: string[]
  username: string
  uuid: string
} | null> {
  const payload = JSON.stringify({
    ident,
    username: user?.username || '',
    uuid: user?.uuid || '',
  })
  const urls = [storeApiUrl('/api/cosmetics/claim')]
  for (const url of urls) {
    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: payload,
      })
    } catch {
      continue
    }
    if (response.status === 409) return null
    if (response.status === 403) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error || 'This payment belongs to a different Minecraft account.')
    }
    if (!response.ok) continue
    const body = (await response.json()) as {
      ownedCapeIds?: unknown
      collection?: unknown
      granted?: unknown
      username?: unknown
      uuid?: unknown
    }
    const granted = Array.isArray(body.granted)
      ? body.granted.filter((id): id is string => typeof id === 'string')
      : []
    const ownedCapeIds = Array.isArray(body.ownedCapeIds)
      ? body.ownedCapeIds.filter((id): id is string => typeof id === 'string')
      : granted
    return {
      ownedCapeIds,
      collection: Boolean(body.collection),
      granted,
      username: typeof body.username === 'string' ? body.username : user?.username || '',
      uuid: typeof body.uuid === 'string' ? body.uuid : user?.uuid || '',
    }
  }
  return null
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
    ownedCapeIds: remote ? remote.ownedCapeIds : same?.ownedCapeIds || [],
    collection: remote ? remote.collection : Boolean(same?.collection),
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
  })
  writeSession(next)
  return next
}

export function ownsCape(user: StoreUser | null, capeId: string): boolean {
  if (!user) return false
  return user.collection || user.ownedCapeIds.includes(capeId)
}

export async function applyVerifiedBasket(ident = takePendingBasket()): Promise<PurchaseResult> {
  const session = readSession()
  if (!ident) return { user: session, complete: false, granted: [] }

  const claimed = await claimPurchase(ident, session)
  if (claimed && claimed.granted.length > 0) {
    const next = withCollection({
      username: claimed.username || session?.username || '',
      uuid: claimed.uuid || session?.uuid || '',
      skinUrl: session?.skinUrl,
      ownedCapeIds: claimed.ownedCapeIds,
      collection: claimed.collection,
    })
    writeSession(next)
    clearPendingBasket()
    return { user: next, complete: true, granted: claimed.granted }
  }

  try {
    const basket = await getTebexBasket(ident)
    if (!basket.complete) return { user: session, complete: false, granted: [] }
    const ids = capeIdsFromBasket(basket)
    if (ids.length === 0) return { user: session, complete: true, granted: [] }
    const basketName = String(basket.username || '').trim()
    const sessionName = session?.username || ''
    if (
      basketName &&
      sessionName &&
      basketName.toLowerCase() !== sessionName.toLowerCase()
    ) {
      throw new Error('This payment belongs to a different Minecraft account.')
    }
    const username = basketName || sessionName
    if (!username) return { user: session, complete: true, granted: ids }
    const next = withCollection({
      username,
      uuid: session?.uuid || '',
      skinUrl: session?.skinUrl,
      ownedCapeIds: [...new Set([...(session?.ownedCapeIds || []), ...ids])],
      collection: isFullCollection(ids) || Boolean(session?.collection),
    })
    writeSession(next)
    if (next.collection) void recordCollectionSale(ident)
    clearPendingBasket()
    return { user: next, complete: true, granted: ids }
  } catch {
    return { user: session, complete: false, granted: [] }
  }
}

export function storeHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base}store`.replace(/([^:/])\/{2,}/g, '$1/')
}
