import { useEffect, useRef, useState, type ReactNode } from 'react'
import { localLaunchTime, useLaunchClock, visitorOutsideFinland } from './launch'
import './LaunchCountdown.css'

type Phase = 'counting' | 'unlocking' | 'open'

const UNLOCK_MS = 1700

/** One digit; a new value rolls in from below while the old one rolls away. */
function Digit({ value }: { value: string }) {
  const previous = useRef(value)
  const [old, setOld] = useState<string | null>(null)
  useEffect(() => {
    if (previous.current === value) return
    setOld(previous.current)
    previous.current = value
    const timer = window.setTimeout(() => setOld(null), 420)
    return () => window.clearTimeout(timer)
  }, [value])
  return (
    <span className="lc-digit">
      {old !== null ? (
        <span key={`out-${old}-${value}`} className="lc-digit-out" aria-hidden="true">
          {old}
        </span>
      ) : null}
      <span key={`in-${value}`} className={old !== null ? 'lc-digit-in' : undefined}>
        {value}
      </span>
    </span>
  )
}

function Unit({ value, label, digits }: { value: number; label: string; digits: number }) {
  const text = String(value).padStart(digits, '0')
  return (
    <div className="lc-unit">
      <div className="lc-value">
        {text.split('').map((digit, index) => (
          <Digit key={index} value={digit} />
        ))}
      </div>
      <span className="lc-label">{label}</span>
    </div>
  )
}

/**
 * The countdown to launch. At zero it plays the unlock (the clock lifts away, a ring of light
 * opens) and the download button appears. Before that there is no download button at all, and
 * the server refuses the download anyway.
 */
export default function LaunchCountdown({ children }: { children: ReactNode }) {
  const { remaining, open } = useLaunchClock()
  const [phase, setPhase] = useState<Phase>(() => (open ? 'open' : 'counting'))

  useEffect(() => {
    if (open && phase === 'counting') setPhase('unlocking')
  }, [open, phase])

  useEffect(() => {
    if (phase !== 'unlocking') return undefined
    const timer = window.setTimeout(() => setPhase('open'), UNLOCK_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  if (phase === 'open') {
    return <div className="lc-open">{children}</div>
  }

  const total = Math.ceil(remaining / 1000)
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60

  return (
    <div className={phase === 'unlocking' ? 'lc is-unlocking' : 'lc'} id="launch-countdown" role="timer" aria-live="off">
      <p className="lc-title">
        <span className="lc-dot" aria-hidden="true" />
        Launching Saturday 24 October, 15:00 Finland time
      </p>
      <div className="lc-units">
        <Unit value={days} label={days === 1 ? 'Day' : 'Days'} digits={2} />
        <span className="lc-sep" aria-hidden="true">:</span>
        <Unit value={hours} label="Hours" digits={2} />
        <span className="lc-sep" aria-hidden="true">:</span>
        <Unit value={minutes} label="Minutes" digits={2} />
        <span className="lc-sep" aria-hidden="true">:</span>
        <Unit value={seconds} label="Seconds" digits={2} />
      </div>
      {visitorOutsideFinland() ? <p className="lc-local">That's {localLaunchTime()} where you are.</p> : null}
      {phase === 'unlocking' ? (
        <div className="lc-burst" aria-hidden="true">
          <span className="lc-ring" />
          <span className="lc-ring lc-ring-2" />
          {Array.from({ length: 14 }, (_, index) => (
            <span key={index} className="lc-spark" style={{ ['--a' as string]: `${(360 / 14) * index}deg` }} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
