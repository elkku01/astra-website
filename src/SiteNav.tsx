import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { startLauncherDownload } from './download'
import { useLaunchClock } from './launch'
import './SiteNav.css'

export const DISCORD_URL = 'https://discord.gg/byKpped2K'

function asset(path: string) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
}

export function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.3 18.3 0 0 0-5.5 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.5 9.1-.3 13.6.1 18.1a19.9 19.9 0 0 0 6 3l1.3-2a13 13 0 0 1-1.9-.9l.4-.3a14.2 14.2 0 0 0 12.1 0l.4.3c-.6.4-1.2.7-1.9.9l1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.9-9.7-3.5-13.7ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.5 8 10.5s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
    </svg>
  )
}

/** One top bar for every page: logo home, the same links, Discord and Download. */
export default function SiteNav({ extra }: { extra?: ReactNode }) {
  const { open } = useLaunchClock()
  return (
    <header className="site-nav">
      <Link className="site-brand" to="/" viewTransition>
        <img src={asset('/images/astra-wordmark.png')} alt="Astra client" width={55} height={36} />
      </Link>
      <nav className="site-links" aria-label="Primary">
        <NavLink to="/" end viewTransition>
          Home
        </NavLink>
        <NavLink to="/store" viewTransition>
          Store
        </NavLink>
        <NavLink to="/status" viewTransition>
          Status
        </NavLink>
      </nav>
      <div className="site-actions">
        {extra}
        <a className="site-icon" href={DISCORD_URL} target="_blank" rel="noreferrer" aria-label="Astra Discord" title="Discord">
          <DiscordIcon />
        </a>
        {open ? (
          <button type="button" className="site-download" onClick={() => void startLauncherDownload()}>
            Download
          </button>
        ) : (
          <button type="button" className="site-download is-locked" onClick={() => void startLauncherDownload()} title="Astra Client launches 24 October, 15:00 Finland time">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2.5" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            Out Oct 24
          </button>
        )}
      </div>
    </header>
  )
}
