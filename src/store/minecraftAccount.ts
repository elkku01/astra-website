export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/
export const INVALID_MINECRAFT_ACCOUNT = 'Invalid Minecraft account.'

export type MinecraftAccount = {
  username: string
  uuid: string
}

function formatUuid(raw: string): string {
  const hex = raw.replace(/-/g, '').toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(hex)) return raw
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

async function fetchJson(url: string, timeoutMs = 7000): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (response.status === 204 || response.status === 400 || response.status === 404) {
      throw new Error('not-found')
    }
    if (!response.ok) throw new Error('fail')
    const text = await response.text()
    if (!text.trim()) throw new Error('not-found')
    return JSON.parse(text) as unknown
  } finally {
    clearTimeout(timer)
  }
}

function asAccount(username?: string | null, uuid?: string | null): MinecraftAccount | null {
  if (!username || !USERNAME_RE.test(username) || !uuid) return null
  const formatted = formatUuid(uuid)
  if (formatted.replace(/-/g, '').length !== 32) return null
  return { username, uuid: formatted }
}

export async function resolveMinecraftAccount(username: string): Promise<MinecraftAccount> {
  const name = username.trim()
  if (!USERNAME_RE.test(name)) throw new Error(INVALID_MINECRAFT_ACCOUNT)

  const sources: Array<() => Promise<MinecraftAccount | null>> = [
    async () => {
      const body = (await fetchJson(
        `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`,
      )) as { id?: string; name?: string }
      const account = asAccount(body.name || name, body.id)
      if (!account) throw new Error('not-found')
      return account
    },
    async () => {
      const body = (await fetchJson(
        `https://api.minecraftservices.com/minecraft/profile/lookup/name/${encodeURIComponent(name)}`,
      )) as { id?: string; name?: string }
      const account = asAccount(body.name || name, body.id)
      if (!account) throw new Error('not-found')
      return account
    },
    async () => {
      const body = (await fetchJson(
        `https://playerdb.co/api/player/minecraft/${encodeURIComponent(name)}`,
      )) as {
        success?: boolean
        code?: string
        data?: { player?: { username?: string; id?: string; raw_id?: string } }
      }
      if (body.success === false || String(body.code || '').includes('invalid')) {
        throw new Error('not-found')
      }
      const player = body.data?.player
      const account = asAccount(player?.username, player?.id || player?.raw_id)
      if (!account) throw new Error('not-found')
      return account
    },
    async () => {
      const body = (await fetchJson(
        `https://api.ashcon.app/mojang/v2/user/${encodeURIComponent(name)}`,
      )) as { username?: string; uuid?: string }
      const account = asAccount(body.username, body.uuid)
      if (!account) throw new Error('not-found')
      return account
    },
    async () => {
      const body = (await fetchJson(
        `https://api.minetools.eu/uuid/${encodeURIComponent(name)}`,
      )) as { id?: string | null; name?: string; status?: string }
      if (body.status === 'ERR' || !body.id) throw new Error('not-found')
      const account = asAccount(body.name || name, body.id)
      if (!account) throw new Error('not-found')
      return account
    },
  ]

  let missing = false
  for (const source of sources) {
    try {
      const account = await source()
      if (account) return account
    } catch (error) {
      if (error instanceof Error && error.message === 'not-found') missing = true
    }
  }

  throw new Error(
    missing
      ? INVALID_MINECRAFT_ACCOUNT
      : 'Could not check that Minecraft account right now. Try again in a moment.',
  )
}
