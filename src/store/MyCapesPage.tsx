import { useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import CapeCard from './CapeCard'
import { CAPES } from './capes'
import { useSession } from './session'
import { WingCard } from './WingsSection'
import { WINGS } from './wings'
import type { StoreOutlet } from './StoreLayout'

export default function MyCapesPage() {
  const { openCheckout, openAccount, owns, ownsWing } = useOutletContext<StoreOutlet>()
  const { user, refreshUser } = useSession()
  const owned = CAPES.filter((cape) => owns(cape.id))
  // Includes rewards like Obsidian Wings, which are never listed in the store.
  const ownedWings = WINGS.filter((wing) => ownsWing(wing.id))
  const total = owned.length + ownedWings.length

  useEffect(() => {
    void refreshUser()
  }, [refreshUser])

  if (!user) {
    return (
      <main className="store-main">
        <p className="kicker">My Cosmetics</p>
        <h1 className="page-title">Link your account to see your cosmetics.</h1>
        <button type="button" className="btn-primary" onClick={openAccount}>
          Link Account
        </button>
      </main>
    )
  }

  return (
    <main className="store-main">
      <p className="kicker">My Cosmetics</p>
      <h1 className="page-title">{total} unlocked</h1>
      <p className="hero-lead">
        Cosmetics unlocked on {user.username}. Astra Client reads the same account.
      </p>
      {total === 0 ? (
        <p className="empty">No cosmetics yet. The launch collection is the fastest way in.</p>
      ) : null}
      {ownedWings.length ? (
        <div className="wing-grid my-wings">
          {ownedWings.map((wing) => (
            <WingCard
              key={wing.id}
              wing={wing}
              owned
              linked
              onBuy={(item) => openCheckout({ kind: 'wing', wing: item })}
              onLink={openAccount}
            />
          ))}
        </div>
      ) : null}
      {owned.length ? (
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
      ) : null}
    </main>
  )
}
