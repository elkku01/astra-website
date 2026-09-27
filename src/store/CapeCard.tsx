import { Link } from 'react-router-dom'
import type { Cape } from './capes'
import { formatPrice, isAnimatedCape, isFreeCape } from './capes'
import CapeThumb from './CapeThumb'

type Props = {
  cape: Cape
  owned?: boolean
  onBuy: (cape: Cape) => void
  onLink?: () => void
}

export default function CapeCard({ cape, owned, onBuy, onLink }: Props) {
  const free = isFreeCape(cape)

  return (
    <article className="cape-card">
      <Link className="cape-card-art" to={`/store/cape/${cape.id}`} viewTransition>
        <CapeThumb cape={cape} />
        {owned ? <span className="owned-badge">Owned</span> : null}
        {isAnimatedCape(cape) ? <span className="tag-badge">Animated</span> : null}
        {free && !owned ? <span className="tag-badge free-badge">Free</span> : null}
      </Link>
      <div className="cape-card-body">
        <h3>{cape.name}</h3>
        <p>{owned ? 'Included in your account' : formatPrice(cape.price)}</p>
        <div className="cape-card-actions">
          <Link className="btn-ghost" to={`/store/cape/${cape.id}`} viewTransition>
            Preview
          </Link>
          {owned ? (
            <span className="btn-owned">Owned</span>
          ) : free ? (
            <button type="button" className="btn-primary" onClick={onLink}>
              Claim free
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={() => onBuy(cape)}>
              Buy
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
