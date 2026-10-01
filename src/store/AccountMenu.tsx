import { knownWingIds } from './wings'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { avatarUrl, ownsCape } from './api'
import { CAPES } from './capes'
import { useSession } from './session'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function AccountMenu({ open, onOpenChange }: Props) {
  const { user, linking, linkError, linkWithUsername, unlink } = useSession()
  const [adding, setAdding] = useState(!user)
  const [username, setUsername] = useState('')
  const [pos, setPos] = useState({ top: 64, right: 28 })
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) {
      setAdding(!user)
      setUsername('')
      return
    }
    setAdding(!user)
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      setPos({
        top: Math.round(rect.bottom + 10),
        right: Math.round(Math.max(12, window.innerWidth - rect.right)),
      })
    }
  }, [open, user])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    try {
      await linkWithUsername(username)
      setUsername('')
      setAdding(false)
    } catch {
      // Error is shown from session.
    }
  }

  const owned = user
    ? CAPES.filter((cape) => ownsCape(user, cape.id)).length + knownWingIds(user.ownedWingIds || []).length
    : 0
  const showForm = !user || adding

  const pop = open
    ? createPortal(
        <>
          <button
            type="button"
            className="account-scrim"
            aria-label="Close account menu"
            onClick={() => onOpenChange(false)}
          />
          <div
            className="account-pop"
            role="dialog"
            aria-label="Account"
            style={{ top: pos.top, right: pos.right }}
          >
            {user ? (
              <header className="account-pop-head">
                <img src={avatarUrl(user.username, 72, user.uuid)} alt="" width={44} height={44} />
                <div>
                  <strong>{user.username}</strong>
                  <p>
                    <em className="linked">Linked</em>
                    <span>
                      {owned} cosmetic{owned === 1 ? '' : 's'}
                    </span>
                  </p>
                </div>
              </header>
            ) : (
              <header className="account-pop-head text">
                <strong>Link account</strong>
                <p>Use the Java Edition username that should own your cosmetics.</p>
              </header>
            )}

            {showForm ? (
              <form className="account-pop-form" onSubmit={(event) => void onSubmit(event)}>
                <label>
                  Minecraft username
                  <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Username"
                    autoComplete="username"
                    spellCheck={false}
                    maxLength={16}
                    autoFocus
                  />
                </label>
                {linkError ? <p className="error">{linkError}</p> : null}
                <div className="account-pop-actions">
                  {user ? (
                    <button type="button" className="btn-ghost" onClick={() => setAdding(false)}>
                      Cancel
                    </button>
                  ) : null}
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={linking || username.trim().length < 3}
                  >
                    {linking ? 'Looking up…' : user ? 'Switch' : 'Link'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="account-pop-menu">
                <button type="button" onClick={() => setAdding(true)}>
                  Add account
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    unlink()
                    onOpenChange(false)
                  }}
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </>,
        document.body,
      )
    : null

  return (
    <div className={`account-slot ${open ? 'open' : ''}`}>
      {user ? (
        <button
          ref={triggerRef}
          type="button"
          className={`account-chip ${open ? 'on' : ''}`}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => onOpenChange(!open)}
        >
          <img src={avatarUrl(user.username, 48, user.uuid)} alt="" width={28} height={28} />
          <span>{user.username}</span>
          <em>Linked</em>
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className="nav-cta"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => onOpenChange(!open)}
        >
          Link Account
        </button>
      )}
      {pop}
    </div>
  )
}
