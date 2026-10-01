import { useState } from 'react'
import { Link, Navigate, useOutletContext, useParams } from 'react-router-dom'
import { formatPrice } from './capes'
import { useSession } from './session'
import WingPreview, { type WingPoseName } from './WingPreview'
import { getWing } from './wings'
import type { StoreOutlet } from './StoreLayout'

const POSES: { id: WingPoseName; label: string }[] = [
  { id: 'standing', label: 'Standing' },
  { id: 'walking', label: 'Walking' },
  { id: 'flying', label: 'Flying' },
  { id: 'sneaking', label: 'Sneaking' },
]

export default function WingDetail() {
  const { id = '' } = useParams()
  const wing = getWing(id)
  const { openCheckout, openAccount, ownsWing } = useOutletContext<StoreOutlet>()
  const { user } = useSession()
  const [pose, setPose] = useState<WingPoseName>('walking')

  // Rewards (Obsidian) are only viewable by players who already have them.
  if (!wing || (!wing.purchasable && !ownsWing(wing.id))) return <Navigate to="/store" replace />

  const owned = ownsWing(wing.id)

  return (
    <main className="store-main cape-detail">
      <Link className="back-link" to="/store" viewTransition>
        ← All cosmetics
      </Link>
      <div className="detail-grid">
        <div className="preview-stage">
          <WingPreview
            wingId={wing.id}
            pose={pose}
            username={user?.username}
            uuid={user?.uuid}
            skinTexture={user?.skinUrl}
          />
          {!user ? (
            <p className="preview-note">
              Link your account to preview these wings on your skin. Steve is standing in for now.
            </p>
          ) : (
            <p className="preview-note">{user.username}</p>
          )}
          <div className="preview-tools">
            {POSES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={pose === item.id ? 'chip on' : 'chip'}
                onClick={() => setPose(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="detail-copy">
          <p className="kicker">Wings</p>
          <h1>{wing.name}</h1>
          <p className="hero-lead">{wing.blurb}</p>
          <p className="detail-price">{owned ? 'Owned' : wing.purchasable ? formatPrice(wing.price) : 'Reward'}</p>
          {owned ? (
            <p className="owned-line">
              {wing.purchasable
                ? 'Already unlocked on this Minecraft account.'
                : 'Early-access reward on this Minecraft account.'}
            </p>
          ) : !user ? (
            <button type="button" className="btn-primary btn-xl" onClick={openAccount}>
              Link account to buy
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary btn-xl"
              onClick={() => openCheckout({ kind: 'wing', wing })}
            >
              Buy for {formatPrice(wing.price)}
            </button>
          )}
          <ul className="detail-points">
            <li>Same model and animation as in game: they beat faster when you run, flap when you fly or fall, and fold when you sneak.</li>
            <li>Equip them in game from the Astra cosmetics menu.</li>
            <li>Other Astra players on your server see them too.</li>
          </ul>
        </div>
      </div>
    </main>
  )
}
