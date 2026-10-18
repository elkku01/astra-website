/**
 * Windows installer download. Every Download button goes through the store server's
 * /api/download, which only hands out the installer from launch on (server/launch.ts).
 */
import { launchOpen } from './launch'
import { storeApiUrl } from './store/storeApi'

export const UPDATES_REPO = String(
  import.meta.env.VITE_UPDATES_REPO || 'elkku01/astra-client-updates'
).trim()

/** Shown until the latest release is known (and if GitHub cannot be reached). */
export const FALLBACK_VERSION = '0.3.30'

let latestVersion: Promise<string> | null = null

/** The newest launcher version, from the latest GitHub Release (asked once per visit). */
export function fetchLatestVersion(): Promise<string> {
  if (!latestVersion) {
    latestVersion = (async () => {
      try {
        const cached = sessionStorage.getItem('astra-latest-version')
        if (cached) return cached
      } catch {
        // Storage can be blocked: just ask GitHub.
      }
      try {
        const response = await fetch(`https://api.github.com/repos/${UPDATES_REPO}/releases/latest`, {
          headers: { Accept: 'application/vnd.github+json' }
        })
        if (!response.ok) return FALLBACK_VERSION
        const release = (await response.json()) as { tag_name?: string }
        const version = String(release.tag_name || '').replace(/^v/i, '')
        if (!/^\d+\.\d+\.\d+$/.test(version)) return FALLBACK_VERSION
        try {
          sessionStorage.setItem('astra-latest-version', version)
        } catch {
          // Not saved: it is asked again next visit.
        }
        return version
      } catch {
        return FALLBACK_VERSION
      }
    })()
  }
  return latestVersion
}
/** Before launch: show the countdown (scrolling to it, or opening the home page). */
function pointToCountdown() {
  const countdown = document.getElementById('launch-countdown')
  if (!countdown) {
    window.location.assign(`${import.meta.env.BASE_URL}#top`)
    return
  }
  countdown.scrollIntoView({ behavior: 'smooth', block: 'center' })
  countdown.classList.remove('is-pinged')
  void countdown.offsetWidth
  countdown.classList.add('is-pinged')
}

export async function startLauncherDownload(): Promise<void> {
  if (!launchOpen()) {
    pointToCountdown()
    return
  }
  window.location.assign(storeApiUrl('/api/download'))
}
