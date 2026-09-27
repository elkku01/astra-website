import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  emptyStatus,
  overallHealth,
  overallLabel,
  rowLabel,
  runStatusChecks,
  type SystemRow,
} from './status'
import './StatusPage.css'

const POLL_MS = 90_000

export default function StatusPage() {
  const [rows, setRows] = useState<SystemRow[]>(emptyStatus)
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    setRows(emptyStatus())
    const next = await runStatusChecks()
    setRows(next)
    setCheckedAt(new Date())
  }, [])

  useEffect(() => {
    const previous = document.title
    document.title = 'Status — Astra'
    void refresh()
    const timer = window.setInterval(() => {
      void refresh()
    }, POLL_MS)
    return () => {
      document.title = previous
      window.clearInterval(timer)
    }
  }, [refresh])

  const overall = overallHealth(rows)

  return (
    <div className="status-page">
      <header className="status-top">
        <Link className="status-brand" to="/" viewTransition>
          Astra
        </Link>
        <span>Status</span>
      </header>

      <main className="status-main">
        <p className={`status-overall ${overall}`}>
          <i aria-hidden="true" />
          {overallLabel(overall)}
        </p>

        <ul className="status-list">
          {rows.map((row) => (
            <li key={row.id}>
              <span>{row.name}</span>
              <b className={row.health}>
                <i aria-hidden="true" />
                {rowLabel(row.health)}
              </b>
            </li>
          ))}
        </ul>

        <p className="status-meta">
          {checkedAt
            ? `Updated ${checkedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
            : 'Updating…'}
          <button type="button" onClick={() => void refresh()}>
            Refresh
          </button>
        </p>
      </main>
    </div>
  )
}