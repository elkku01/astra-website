import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { wingImage, wingMatches } from './WingsSection'
import WingPreview from './WingPreview'
import { purchasableWings, type Wing } from './wings'
import CapeThumb from './CapeThumb'
import {
  CAPES,
  COLLECTION_LAUNCH_PRICE,
  COLLECTION_LIMIT,
  formatPrice,
  isAnimatedCape,
  isFreeCape,
  paidCapes,
  type Cape,
  type CapeCategory,
} from './capes'
import { capeThumbUrl } from './capeArt'
import { useCollectionStock } from './collectionStock'
import { useSession } from './session'
import type { StoreOutlet } from './StoreLayout'

type Tab = 'cloaks' | 'wings' | 'owned'

const FILTERS: { id: CapeCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'popular', label: 'Popular' },
  { id: 'animated', label: 'Animated' },
]

/** Wings shown in the big featured card, in turn. */
const FEATURED_WINGS = ['purple', 'red', 'gold']
const FEATURE_MS = 8000

function capeMatches(cape: Cape, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return cape.name.toLowerCase().includes(q) || cape.blurb.toLowerCase().includes(q)
}

export default function StoreHome() {
  const { openCheckout, owns, ownsWing } = useOutletContext<StoreOutlet>()
  const { user } = useSession()
  const [tab, setTab] = useState<Tab>('cloaks')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<CapeCategory>('all')
  const stock = useCollectionStock()

  const wings = purchasableWings()
  const featured = useMemo(
    () => FEATURED_WINGS.map((id) => wings.find((wing) => wing.id === id)).filter((wing): wing is Wing => Boolean(wing)),
    [wings],
  )
  const [featureIndex, setFeatureIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused || featured.length < 2) return
    const timer = window.setTimeout(() => setFeatureIndex((index) => (index + 1) % featured.length), FEATURE_MS)
    return () => window.clearTimeout(timer)
  }, [featureIndex, paused, featured.length])
  const feature = featured[featureIndex % Math.max(1, featured.length)]

  const ownedCapes = CAPES.filter((cape) => owns(cape.id))
  const ownedWings = wings.filter((wing) => ownsWing(wing.id))

  const capes = useMemo(
    () =>
      CAPES.filter((cape) => (filter === 'all' || cape.categories.includes(filter)) && capeMatches(cape, query)),
    [filter, query],
  )
  const wingList = wings.filter((wing) => wingMatches(wing, query))
  const ownedList = {
    capes: ownedCapes.filter((cape) => capeMatches(cape, query)),
    wings: ownedWings.filter((wing) => wingMatches(wing, query)),
  }

  const teaser = ['torii', 'gojo', 'void', 'aura']
    .map((id) => CAPES.find((cape) => cape.id === id))
    .filter((cape): cape is Cape => Boolean(cape))

  return (
    <main className="store-main shop">
      {feature ? (
        <section
          className="shop-feature"
          aria-roledescription="carousel"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="shop-feature-copy" key={feature.id}>
            <p className="shop-kicker">
              <span className="shop-new">New</span>Wings
            </p>
            <h1>{feature.name}</h1>
            <p className="shop-lead">
              {feature.blurb} {user ? 'Shown here on your own skin, exactly as they look in game.' : 'Exactly as they look in game.'}
            </p>
            <div className="shop-feature-actions">
              {ownsWing(feature.id) ? (
                <Link className="btn-primary btn-lg" to={`/store/wings/${feature.id}`} viewTransition>
                  Owned · View
                </Link>
              ) : (
                <button type="button" className="btn-primary btn-lg" onClick={() => openCheckout({ kind: 'wing', wing: feature })}>
                  Buy for {formatPrice(feature.price)}
                </button>
              )}
              <button type="button" className="btn-ghost btn-lg" onClick={() => setTab('wings')}>
                See all wings
              </button>
            </div>
            {featured.length > 1 ? (
              <div className="shop-dots" role="tablist" aria-label="Featured items">
                {featured.map((wing, index) => (
                  <button
                    key={wing.id}
                    type="button"
                    role="tab"
                    aria-selected={index === featureIndex}
                    aria-label={wing.name}
                    className={index === featureIndex ? 'on' : undefined}
                    onClick={() => setFeatureIndex(index)}
                  />
                ))}
              </div>
            ) : null}
          </div>
          <Link className="shop-feature-art" to={`/store/wings/${feature.id}`} viewTransition aria-label={`Preview ${feature.name}`}>
            <WingPreview
              wingId={feature.id}
              pose="walking"
              username={user?.username}
              uuid={user?.uuid}
              skinTexture={user?.skinUrl}
              width={420}
              height={400}
              zoom={0.8}
            />
          </Link>
        </section>
      ) : null}

      <section className="shop-offer">
        <div className="shop-offer-stack" aria-hidden="true">
          {teaser.map((cape) => (
            <img key={cape.id} src={capeThumbUrl(cape)} alt="" />
          ))}
        </div>
        <p>
          <strong>Launch collection</strong>
          <span>
            All {paidCapes().length} paid cloaks for {formatPrice(COLLECTION_LAUNCH_PRICE)}, only for the first {COLLECTION_LIMIT} players.
          </span>
        </p>
        <div className="shop-offer-stock">
          <span className="shop-meter" aria-hidden="true">
            <i style={{ width: `${((stock.remaining ?? stock.limit) / Math.max(1, stock.limit)) * 100}%` }} />
          </span>
          {stock.soldOut ? 'Sold out' : stock.remaining === null ? `${stock.limit} only` : `${stock.remaining} of ${stock.limit} left`}
        </div>
        <Link className="btn-ghost" to="/store/collection" viewTransition>
          View
        </Link>
        <button
          type="button"
          className="btn-primary"
          disabled={stock.soldOut}
          onClick={() => openCheckout({ kind: 'collection' })}
        >
          {stock.soldOut ? 'Sold out' : 'Get the collection'}
        </button>
      </section>

      <div className="shop-toolbar">
        <div className="shop-tabs" role="tablist" aria-label="Cosmetics">
          {(
            [
              ['cloaks', 'Cloaks', CAPES.length],
              ['wings', 'Wings', wings.length],
              ['owned', 'Owned', ownedCapes.length + ownedWings.length],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? 'on' : undefined}
              onClick={() => setTab(id)}
            >
              {label}
              <small>{count}</small>
            </button>
          ))}
        </div>
        {tab === 'cloaks' ? (
          <div className="filters">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={filter === item.id ? 'chip on' : 'chip'}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
        <input
          className="search shop-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search cosmetics"
          aria-label="Search cosmetics"
        />
      </div>

      {tab === 'cloaks' ? (
        capes.length ? (
          <div className="shop-grid">
            {capes.map((cape) => (
              <CloakTile key={cape.id} cape={cape} owned={owns(cape.id)} />
            ))}
          </div>
        ) : (
          <p className="empty">No cloaks match that search.</p>
        )
      ) : null}

      {tab === 'wings' ? (
        wingList.length ? (
          <div className="shop-grid is-wings">
            {wingList.map((wing) => (
              <WingTile key={wing.id} wing={wing} owned={ownsWing(wing.id)} />
            ))}
          </div>
        ) : (
          <p className="empty">No wings match that search.</p>
        )
      ) : null}

      {tab === 'owned' ? (
        !user ? (
          <p className="empty">Link your Minecraft account to see what you own.</p>
        ) : ownedList.capes.length + ownedList.wings.length ? (
          <div className="shop-grid">
            {ownedList.wings.map((wing) => (
              <WingTile key={wing.id} wing={wing} owned />
            ))}
            {ownedList.capes.map((cape) => (
              <CloakTile key={cape.id} cape={cape} owned />
            ))}
          </div>
        ) : (
          <p className="empty">Nothing here yet.</p>
        )
      ) : null}

      <p className="shop-support">Every purchase backs Astra client and helps make it faster and better.</p>
    </main>
  )
}

function CloakTile({ cape, owned }: { cape: Cape; owned: boolean }) {
  const free = isFreeCape(cape)
  const tag = isAnimatedCape(cape)
    ? 'Animated'
    : cape.categories.includes('new')
      ? 'New'
      : cape.categories.includes('popular')
        ? 'Popular'
        : ''
  return (
    <Link className="shop-tile" to={`/store/cape/${cape.id}`} viewTransition>
      <span className="shop-tile-art">
        {tag ? <span className="shop-tag">{tag}</span> : null}
        <CapeThumb cape={cape} />
      </span>
      <span className="shop-tile-body">
        <strong>{cape.name}</strong>
        {owned ? <em className="is-owned">Owned</em> : free ? <em className="is-owned">Free</em> : <em>{formatPrice(cape.price)}</em>}
      </span>
    </Link>
  )
}

function WingTile({ wing, owned }: { wing: Wing; owned: boolean }) {
  return (
    <Link className="shop-tile is-wing" to={`/store/wings/${wing.id}`} viewTransition>
      <span className="shop-tile-art">
        <img src={wingImage(wing.id)} alt="" loading="lazy" />
      </span>
      <span className="shop-tile-body">
        <strong>{wing.name}</strong>
        {owned ? <em className="is-owned">Owned</em> : <em>{formatPrice(wing.price)}</em>}
      </span>
    </Link>
  )
}
