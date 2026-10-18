/**
 * Launch gate. Nobody can get the installer before launch: the website only shows a countdown,
 * and this server (with its own clock, never the visitor's) refuses to hand out the download
 * until the moment comes. Before launch the release repository is private too, so there is no
 * other address to fetch it from.
 */

/** 24 October 2026, 15:00 Finland time (summer time, UTC+3) = 12:00 UTC. */
export const LAUNCH_AT = Date.UTC(2026, 9, 24, 12, 0, 0)

const RELEASES_REPO = 'elkku01/astra-client-updates'
const RELEASES_PAGE = `https://github.com/${RELEASES_REPO}/releases/latest`
const INSTALLER = /^AstraClient-Setup-\d+\.\d+\.\d+\.exe$/

let cachedInstaller: { url: string; until: number } | null = null

export function isLaunched(now = Date.now()): boolean {
  return now >= LAUNCH_AT
}

/** Handles /api/launch and /api/download; null for every other request. */
export async function handleLaunch(
  request: Request,
  allowedOrigins: string[],
  now = Date.now(),
  fetcher: typeof fetch = fetch,
): Promise<Response | null> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '')
  if (path !== '/api/launch' && path !== '/api/download') return null

  const origin = request.headers.get('Origin') || ''
  const cors: Record<string, string> = allowedOrigins.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : {}
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '600' } })
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'Method not allowed' }, 405, cors)
  }

  if (path === '/api/launch') {
    return json({ launchAt: LAUNCH_AT, now, open: isLaunched(now) }, 200, cors)
  }

  // /api/download
  if (!isLaunched(now)) {
    return json({ error: 'Astra Client is not out yet.', launchAt: LAUNCH_AT }, 403, cors)
  }
  const installer = await installerUrl(now, fetcher)
  return new Response(null, {
    status: 302,
    headers: { Location: installer || RELEASES_PAGE, 'Cache-Control': 'no-store', ...cors },
  })
}

/** The newest installer on GitHub (asked at most every 5 minutes). */
async function installerUrl(now: number, fetcher: typeof fetch): Promise<string | null> {
  if (cachedInstaller && cachedInstaller.until > now) return cachedInstaller.url
  try {
    const response = await fetcher(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'astra-store' },
    })
    if (!response.ok) return null
    const release = (await response.json()) as { assets?: { name?: string; browser_download_url?: string }[] }
    const asset = (release.assets || []).find((item) => INSTALLER.test(String(item.name || '')))
    const link = String(asset?.browser_download_url || '')
    if (!link.startsWith(`https://github.com/${RELEASES_REPO}/releases/download/`)) return null
    cachedInstaller = { url: link, until: now + 5 * 60 * 1000 }
    return link
  } catch {
    return null
  }
}

/** Tests only. */
export function resetInstallerCache() {
  cachedInstaller = null
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })
}
