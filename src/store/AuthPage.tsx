import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useSession } from './session'
import './Store.css'

export default function AuthPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const { linkWithToken, linkError, user } = useSession()
  const [status, setStatus] = useState(
    token ? 'Linking your Astra account…' : 'Missing token',
  )
  const navigate = useNavigate()

  useEffect(() => {
    if (!token) return
    let cancelled = false
    void linkWithToken(token)
      .then(() => {
        if (cancelled) return
        setStatus('Linked. Redirecting…')
        window.setTimeout(() => navigate('/store', { replace: true }), 400)
      })
      .catch(() => {
        if (!cancelled) setStatus('That token is invalid or expired.')
      })
    return () => {
      cancelled = true
    }
  }, [token, linkWithToken, navigate])

  return (
    <div className="store-page auth-page">
      <main className="store-main">
        <p className="kicker">Astra Cosmetics</p>
        <h1 className="page-title">{user ? 'Account linked' : status}</h1>
        {linkError ? <p className="error">{linkError}</p> : null}
        <p className="hero-lead">
          Client tokens are verified by the store backend. You can also link from the store with
          your Java Edition username.
        </p>
        <Link className="btn-primary" to="/store?link=1" viewTransition>
          Link account
        </Link>
      </main>
    </div>
  )
}
