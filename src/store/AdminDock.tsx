import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminLogin, isAdminAuthed } from './admin'

export default function AdminDock() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const authed = isAdminAuthed()

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await adminLogin(password)
      setPassword('')
      setOpen(false)
      navigate('/store/admin')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log in')
    } finally {
      setBusy(false)
    }
  }

  if (authed) {
    return (
      <div className="admin-dock">
        <Link className="admin-dock-btn" to="/store/admin" viewTransition>
          Admin
        </Link>
      </div>
    )
  }

  return (
    <div className={`admin-dock ${open ? 'open' : ''}`}>
      {open ? (
        <form className="admin-box" onSubmit={(event) => void onSubmit(event)}>
          <p>Admin</p>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            aria-label="Admin password"
          />
          {error ? <span className="error">{error}</span> : null}
          <div className="admin-box-actions">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Close
            </button>
            <button type="submit" className="btn-primary" disabled={busy || password.length < 8}>
              {busy ? 'Checking…' : 'Log in'}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="admin-dock-btn" onClick={() => setOpen(true)}>
          Admin
        </button>
      )}
    </div>
  )
}
