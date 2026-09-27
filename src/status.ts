import { UPDATES_REPO } from './download'

export type Health = 'checking' | 'operational' | 'degraded' | 'unavailable'

export type SystemRow = {
  id: string
  name: string
  health: Health
}

const REQUEST_MS = 8_000

function homeUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  return new URL(base, window.location.origin).toString()
}

async function probe(
  url: string,
  test: (response: Response) => boolean | Promise<boolean> = (response) => response.ok,
): Promise<boolean> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), REQUEST_MS)
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json, text/plain, */*' },
    })
    return await test(response)
  } catch {
    return false
  } finally {
    window.clearTimeout(timer)
  }
}

async function checkWebsite(): Promise<Health> {
  return (await probe(homeUrl())) ? 'operational' : 'unavailable'
}

async function checkDownloads(): Promise<Health> {
  if (!UPDATES_REPO) return 'unavailable'
  const ok = await probe(
    `https://api.github.com/repos/${UPDATES_REPO}/releases/latest`,
    async (response) => {
      if (!response.ok) return false
      const body = (await response.json()) as {
        assets?: { name?: string }[]
      }
      return (body.assets || []).some(
        (asset) =>
          typeof asset.name === 'string' &&
          /^AstraClient-Setup-.*\.exe$/i.test(asset.name) &&
          !asset.name.toLowerCase().endsWith('.blockmap'),
      )
    },
  )
  return ok ? 'operational' : 'unavailable'
}

async function checkModrinth(): Promise<Health> {
  const ok = await probe(
    'https://api.modrinth.com/v2/search?limit=1',
    async (response) => {
      if (!response.ok) return false
      const body = (await response.json()) as { hits?: unknown }
      return Array.isArray(body.hits)
    },
  )
  return ok ? 'operational' : 'unavailable'
}

async function checkMinecraft(): Promise<Health> {
  const ok = await probe(
    'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
    async (response) => {
      if (!response.ok) return false
      const body = (await response.json()) as { versions?: unknown }
      return Array.isArray(body.versions) && body.versions.length > 0
    },
  )
  return ok ? 'operational' : 'unavailable'
}

async function checkMicrosoft(): Promise<Health> {
  const ok = await probe(
    'https://login.microsoftonline.com/consumers/v2.0/.well-known/openid-configuration',
    async (response) => {
      if (!response.ok) return false
      const body = (await response.json()) as { authorization_endpoint?: unknown }
      return typeof body.authorization_endpoint === 'string'
    },
  )
  return ok ? 'operational' : 'unavailable'
}

async function checkTebex(): Promise<Health> {
  const token = String(import.meta.env.VITE_TEBEX_PUBLIC_TOKEN || '').trim()
  if (!token) return 'unavailable'
  const ok = await probe(
    `https://headless.tebex.io/api/accounts/${encodeURIComponent(token)}`,
    (response) => response.ok,
  )
  return ok ? 'operational' : 'unavailable'
}

async function checkDiscord(): Promise<Health> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), REQUEST_MS)
  try {
    const response = await fetch('https://discordstatus.com/api/v2/status.json', {
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) return 'unavailable'
    const body = (await response.json()) as { status?: { indicator?: string } }
    const indicator = body.status?.indicator
    if (indicator === 'none') return 'operational'
    if (indicator === 'minor') return 'degraded'
    return 'unavailable'
  } catch {
    return 'unavailable'
  } finally {
    window.clearTimeout(timer)
  }
}

const CHECKS: { id: string; name: string; run: () => Promise<Health> }[] = [
  { id: 'website', name: 'Website', run: checkWebsite },
  { id: 'downloads', name: 'Downloads', run: checkDownloads },
  { id: 'modrinth', name: 'Mod browser', run: checkModrinth },
  { id: 'minecraft', name: 'Minecraft services', run: checkMinecraft },
  { id: 'microsoft', name: 'Microsoft login', run: checkMicrosoft },
  { id: 'discord', name: 'Discord', run: checkDiscord },
  ...(String(import.meta.env.VITE_TEBEX_PUBLIC_TOKEN || '').trim()
    ? [{ id: 'tebex', name: 'Store payments', run: checkTebex }]
    : []),
]

export function emptyStatus(): SystemRow[] {
  return CHECKS.map((item) => ({
    id: item.id,
    name: item.name,
    health: 'checking',
  }))
}

export async function runStatusChecks(): Promise<SystemRow[]> {
  return Promise.all(
    CHECKS.map(async (item) => ({
      id: item.id,
      name: item.name,
      health: await item.run(),
    })),
  )
}

export function overallHealth(rows: SystemRow[]): Health {
  if (rows.some((row) => row.health === 'checking')) return 'checking'
  if (rows.every((row) => row.health === 'operational')) return 'operational'
  if (rows.every((row) => row.health === 'unavailable')) return 'unavailable'
  return 'degraded'
}

export function overallLabel(health: Health): string {
  if (health === 'checking') return 'Checking systems'
  if (health === 'operational') return 'All systems operational'
  if (health === 'degraded') return 'Partial outage'
  return 'Major outage'
}

export function rowLabel(health: Health): string {
  if (health === 'checking') return 'Checking'
  if (health === 'operational') return 'Operational'
  if (health === 'degraded') return 'Degraded'
  return 'Unavailable'
}

export function isStatusRoute(): boolean {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  if (path.endsWith('/status')) return true
  const hash = window.location.hash.replace(/^#\/?/, '')
  return hash === 'status'
}

export function statusHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base}status`.replace(/([^:/])\/{2,}/g, '$1/')
}

export function homeHref(): string {
  return import.meta.env.BASE_URL || '/'
}
