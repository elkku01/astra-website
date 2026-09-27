import { useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import CapeCard from './CapeCard'
import { CAPES } from './capes'
import { useSession } from './session'
import type { StoreOutlet } from './StoreLayout'

export default function MyCapesPage() {
  const { openCheckout, openAccount, owns } = useOutletContext<StoreOutlet>()
  const { user, refreshUser } = useSession()
  const owned = CAPES.filter((cape) => owns(cape.id))

  useEffect(() => {
    void refreshUser()
  }, [refreshUser])

  if (!user) {
    return (
      <main className="store-main">
        <p className="kicker">My Cloaks</p>
        <h1 className="page-title">Link your account to see owned cloaks.</h1>
        <button type="button" className="btn-primary" onClick={openAccount}>
          Link Account
        </button>
      </main>
    )
  }

  return (
    <main className="store-main">
      <p className="kicker">My Cloaks</p>
      <h1 className="page-title">{owned.length} unlocked</h1>
      <p className="hero-lead">
        Cloaks unlocked on {user.username}. Astra Client reads the same account.
      </p>
      {owned.length === 0 ? (
        <p className="empty">No cloaks yet. The launch collection is the fastest way in.</p>
      ) : (
        <div className="cape-grid">
          {owned.map((cape) => (
            <CapeCard
              key={cape.id}
              cape={cape}
              owned
              onBuy={(item) => openCheckout({ kind: 'cape', cape: item })}
              onLink={openAccount}
            />
          ))}
        </div>
      )}
    </main>
  )
}
