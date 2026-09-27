import { useState } from 'react'
import { Link, Navigate, useOutletContext, useParams } from 'react-router-dom'
import { formatAddedAt, formatPrice, getCape, isFreeCape } from './capes'
import { useSession } from './session'
import SkinPreview from './SkinPreview'
import type { StoreOutlet } from './StoreLayout'

export default function CapeDetail() {
  const { id = '' } = useParams()
  const cape = getCape(id)
  const { openCheckout, openAccount, owns } = useOutletContext<StoreOutlet>()
  const { user } = useSession()
  const [walking, setWalking] = useState(true)

  if (!cape) return <Navigate to="/store" replace />

  const owned = owns(cape.id)
  const added = formatAddedAt(cape.createdAt)
  const free = isFreeCape(cape)

  return (
    <main className="store-main cape-detail">
      <Link className="back-link" to="/store" viewTransition>
        ← All cloaks
      </Link>
      <div className="detail-grid">
        <div className="preview-stage">
          <SkinPreview
            cape={cape}
            username={user?.username}
            uuid={user?.uuid}
            skinTexture={user?.skinUrl}
            walking={walking}
          />
          {added ? <p className="preview-added">Added {added}</p> : null}
          {!user ? (
            <p className="preview-note">
              Link your account to preview this cloak on your skin. Steve is
              standing in for now.
            </p>
          ) : (
            <p className="preview-note">{user.username}</p>
          )}
          <div className="preview-tools">
            <button
              type="button"
              className={walking ? 'chip' : 'chip on'}
              onClick={() => setWalking(false)}
            >
              Standing
            </button>
            <button
              type="button"
              className={walking ? 'chip on' : 'chip'}
              onClick={() => setWalking(true)}
            >
              Walking
            </button>
          </div>
        </div>
        <div className="detail-copy">
          <p className="kicker">Cloak</p>
          <h1>{cape.name}</h1>
          <p className="hero-lead">{cape.blurb}</p>
          <p className="detail-price">
            {owned ? 'Owned' : formatPrice(cape.price)}
          </p>
          {owned ? (
            <p className="owned-line">
              {free ? 'Included free with Astra.' : 'Already unlocked on this Minecraft account.'}
            </p>
          ) : free ? (
            <button type="button" className="btn-primary btn-xl" onClick={openAccount}>
              Link account to claim
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary btn-xl"
              onClick={() => openCheckout({ kind: 'cape', cape })}
            >
              Buy
            </button>
          )}
          {!user && !free ? (
            <p className="link-hint">Purchases require a linked Minecraft account.</p>
          ) : null}
        </div>
      </div>
    </main>
  )
}
