/**
 * Windows installer download.
 *
 * The site serves a copy from /AstraClient-Setup.exe (see public/).
 * After you publish with `npm run enroll` in the launcher repo, set
 * VITE_UPDATES_REPO to "your-github-user/astra-client-updates" so the
 * button always fetches the latest GitHub Release .exe.
 */
export const UPDATES_REPO = String(
  import.meta.env.VITE_UPDATES_REPO || 'elkku01/astra-client-updates'
).trim()

export const BUNDLED_SETUP_PATH = '/AstraClient-Setup.exe'

export const LAUNCHER_DOWNLOAD_URL: string = UPDATES_REPO
  ? `https://github.com/${UPDATES_REPO}/releases/latest`
  : BUNDLED_SETUP_PATH

export const DOWNLOAD_LABEL = 'Download for Windows'
export const DOWNLOAD_META = 'Astra Setup · includes launcher + client · Java installs on Launch'

interface GitHubAsset {
  name?: string
  browser_download_url?: string
}

interface GitHubRelease {
  assets?: GitHubAsset[]
}

export async function startLauncherDownload(): Promise<void> {
  const url = await resolveInstallerUrl()
  const link = document.createElement('a')
  link.href = url
  link.rel = 'noopener'
  if (url.startsWith('/') || url.endsWith('.exe')) {
    link.download = 'AstraClient-Setup.exe'
  }
  document.body.appendChild(link)
  link.click()
  link.remove()
}

async function resolveInstallerUrl(): Promise<string> {
  if (UPDATES_REPO) {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${UPDATES_REPO}/releases/latest`,
        { headers: { Accept: 'application/vnd.github+json' } }
      )
      if (response.ok) {
        const release = (await response.json()) as GitHubRelease
        const asset = (release.assets || []).find(
          (item) =>
            typeof item.name === 'string' &&
            /^AstraClient-Setup-.*\.exe$/i.test(item.name) &&
            !item.name.toLowerCase().endsWith('.blockmap') &&
            item.browser_download_url
        )
        if (asset?.browser_download_url) return asset.browser_download_url
      }
    } catch {
      // Use the bundled installer if GitHub is unreachable.
    }
  }
  return BUNDLED_SETUP_PATH
}
