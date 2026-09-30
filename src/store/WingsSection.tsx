import { formatPrice } from './capes'
import { purchasableWings, type Wing } from './wings'

const base = import.meta.env.BASE_URL || '/'

function wingImage(id: string): string {
  return `${base}wings/${id}.png`.replace(/([^:/])\/{2,}/g, '$1/')
}

type Props = {
  ownsWing: (id: string) => boolean
  linked: boolean
  onBuy: (wing: Wing) => void
  onLink: () => void
}

/** Paid wings. Early-access rewards are never listed here. */
export default function WingsSection({ ownsWing, linked, onBuy, onLink }: Props) {
  const wings = purchasableWings()
  return (
    <section className="wings-section" aria-labelledby="wings-title">
      <p className="kicker">Wings</p>
      <h2 id="wings-title">Nebula Wings</h2>
      <p className="wings-lead">
        Animated bat wings that beat when you fly and fold when you sneak. Each set unlocks in Astra
        Client on your Minecraft account.
      </p>
      <div className="wing-grid">
        {wings.map((wing) => {
          const owned = ownsWing(wing.id)
          return (
            <article key={wing.id} className={`wing-card${owned ? ' owned' : ''}`}>
              <div className="wing-art">
                <img src={wingImage(wing.id)} alt="" loading="lazy" />
              </div>
              <h3>{wing.name}</h3>
              <p>{wing.blurb}</p>
              <div className="wing-foot">
                <span className="wing-price">{owned ? 'Owned' : formatPrice(wing.price)}</span>
                {owned ? null : linked ? (
                  <button type="button" className="btn-primary" onClick={() => onBuy(wing)}>
                    Buy
                  </button>
                ) : (
                  <button type="button" className="btn-ghost" onClick={onLink}>
                    Link account
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
