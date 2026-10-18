import { useEffect, useState } from 'react'
import { storeApiUrl } from './store/storeApi'

/**
 * Launch: 24 October 2026, 15:00 Finland time (12:00 UTC). The page only shows the countdown;
 * the store server decides when the installer can be downloaded (server/launch.ts), so changing
 * this page or the computer's clock never unlocks anything.
 */
export const LAUNCH_AT = Date.UTC(2026, 9, 24, 12, 0, 0)

/** Server time minus this computer's time, so a wrong PC clock still counts down correctly. */
let offset = 0
let synced: Promise<void> | null = null

/** Developer preview only (`npm run dev`): ?launchIn=10 counts down 10 seconds to watch the unlock. */
const previewAt = (() => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null
  const raw = new URLSearchParams(window.location.search).get('launchIn')
  const seconds = raw === null || raw.trim() === '' ? NaN : Number(raw)
  return Number.isFinite(seconds) && seconds >= 0 ? Date.now() + seconds * 1000 : null
})()

function launchAt() {
  return previewAt ?? LAUNCH_AT
}

export function serverNow() {
  return Date.now() + offset
}

export function launchOpen() {
  return serverNow() >= launchAt()
}

function syncClock(): Promise<void> {
  if (!synced) {
    synced = (async () => {
      try {
        const started = Date.now()
        const response = await fetch(storeApiUrl('/api/launch'), { cache: 'no-store' })
        if (!response.ok) return
        const body = (await response.json()) as { now?: unknown }
        const now = Number(body.now)
        if (!Number.isFinite(now)) return
        // Halfway through the request is when the server read its clock.
        offset = now - (started + (Date.now() - started) / 2)
      } catch {
        // Offline or blocked: count with this computer's clock (the download is still server-gated).
      }
    })()
  }
  return synced
}

export interface LaunchClock {
  /** Milliseconds until launch (0 once launched). */
  remaining: number
  open: boolean
}

/** Ticks a few times a second so the seconds change right on time. */
export function useLaunchClock(): LaunchClock {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    let live = true
    void syncClock().then(() => {
      if (live) setNow(serverNow())
    })
    const timer = window.setInterval(() => setNow(serverNow()), 200)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [])
  const remaining = Math.max(0, launchAt() - now)
  return { remaining, open: remaining === 0 }
}

/** "Saturday 24 October, 15:00" in the visitor's own time zone. */
export function localLaunchTime() {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(LAUNCH_AT))
}

/** True when the visitor is not on Finland time (then their own time is shown too). */
export function visitorOutsideFinland() {
  try {
    const finland = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', hour: '2-digit', minute: '2-digit' }).format(new Date(LAUNCH_AT))
    const local = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(LAUNCH_AT))
    return finland !== local
  } catch {
    return false
  }
}
