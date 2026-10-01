import { Link } from 'react-router-dom'
import { formatPrice } from './capes'
import { purchasableWings, type Wing } from './wings'

const base = import.meta.env.BASE_URL || '/'

export function wingImage(id: string): string {
  return `${base}wings/${id}.png`.replace(/([^:/])\/{2,}/g, '$1/')
}

export function wingMatches(wing: Wing, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [wing.name, wing.blurb, 'wings', 'wing'].some((text) => text.toLowerCase().includes(q))
}

type CardProps = {
  wing: Wing
  owned: boolean
  linked: boolean
  onBuy: (wing: Wing) => void
  onLink: () => void
}

export function WingCard({ wing, owned, linked, onBuy, onLink }: CardProps) {
  return (
    <article className={`wing-card${owned ? ' owned' : ''}`}>
      <Link className="wing-art" to={`/store/wings/${wing.id}`} viewTransition>
        <img src={wingImage(wing.id)} alt="" loading="lazy" />
      </Link>
      <h3>{wing.name}</h3>
      <p>{wing.blurb}</p>
      <div className="wing-foot">
        <span className="wing-price">{owned ? 'Owned' : formatPrice(wing.price)}</span>
        <span className="wing-actions">
          <Link className="btn-ghost" to={`/store/wings/${wing.id}`} viewTransition>
            Preview
          </Link>
          {owned || !wing.purchasable ? null : linked ? (
            <button type="button" className="btn-primary" onClick={() => onBuy(wing)}>
              Buy
            </button>
          ) : (
            <button type="button" className="btn-ghost" onClick={onLink}>
              Link account
            </button>
          )}
        </span>
      </div>
    </article>
  )
}

type Props = {
  ownsWing: (id: string) => boolean
  linked: boolean
  query?: string
  onBuy: (wing: Wing) => void
  onLink: () => void
}

/** Paid wings. Early-access rewards are never listed here. */
export default function WingsSection({ ownsWing, linked, query = '', onBuy, onLink }: Props) {
  const wings = purchasableWings().filter((wing) => wingMatches(wing, query))
  if (wings.length === 0) return null
  return (
    <section className="wings-section" aria-labelledby="wings-title">
      <p className="kicker">Wings</p>
      <h2 id="wings-title">Nebula Wings</h2>
      <p className="wings-lead">
        Animated bat wings that beat when you fly and fold when you sneak. Preview them on your skin,
        then unlock them in Astra Client on your Minecraft account.
      </p>
      <div className="wing-grid">
        {wings.map((wing) => (
          <WingCard
            key={wing.id}
            wing={wing}
            owned={ownsWing(wing.id)}
            linked={linked}
            onBuy={onBuy}
            onLink={onLink}
          />
        ))}
      </div>
    </section>
  )
}
