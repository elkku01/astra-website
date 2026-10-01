import { useMemo, useState } from 'react'
import WingsSection, { wingMatches } from './WingsSection'
import { purchasableWings } from './wings'
import { Link, useOutletContext } from 'react-router-dom'
import CapeCard from './CapeCard'
import { CAPES, COLLECTION_LAUNCH_PRICE, COLLECTION_LIMIT, formatPrice, paidCapes, type CapeCategory } from './capes'
import { collectionPrice } from './api'
import { useCollectionStock, formatCollectionStock } from './collectionStock'
import { useSession } from './session'
import type { StoreOutlet } from './StoreLayout'

const FILTERS: { id: CapeCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'popular', label: 'Popular' },
  { id: 'animated', label: 'Animated' },
]

export default function StoreHome() {
  const { openCheckout, openAccount, owns, ownsWing } = useOutletContext<StoreOutlet>()
  const { user } = useSession()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<CapeCategory>('all')
  const bundle = collectionPrice()
  const stock = useCollectionStock()

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return CAPES.filter((cape) => {
      if (filter !== 'all' && !cape.categories.includes(filter)) return false
      if (!q) return true
      return cape.name.toLowerCase().includes(q) || cape.blurb.toLowerCase().includes(q)
    })
  }, [query, filter])
  // Wings have no cloak categories, so they show under All (and in search).
  const wingHits = filter === 'all' && purchasableWings().some((wing) => wingMatches(wing, query))

  return (
    <main className="store-main">
      <section className="store-hero">
        <div className="hero-glow" aria-hidden="true" />
        <p className="kicker">Official companion store</p>
        <h1>
          <span className="hero-word">ASTRA</span>
          <span className="hero-sub">Cosmetics</span>
        </h1>
        <p className="hero-lead">
          The same cloaks and wings as Astra Client. Preview them on your skin, then check out to unlock.
        </p>
        <div className="launch-offer">
          <strong>Launch collection · {COLLECTION_LIMIT} only</strong>
          <span>
            Entire paid catalog — {paidCapes().length} cloaks — for {formatPrice(COLLECTION_LAUNCH_PRICE)}
          </span>
          <em>{formatCollectionStock(stock)}. Astra-branded cloaks stay free.</em>
        </div>
        {!user ? (
          <p className="link-hint">
            Link your Minecraft username to preview cosmetics on your skin before you buy.
          </p>
        ) : null}
      </section>

      <section className="bundle-row">
        <div>
          <p className="kicker">Bundle</p>
          <h2>Unlock Entire Collection</h2>
          <p>
            {formatPrice(bundle)} · {paidCapes().length} paid cloaks · {formatCollectionStock(stock)}
          </p>
        </div>
        <div className="bundle-actions">
          <Link className="btn-ghost" to="/store/collection" viewTransition>
            View collection
          </Link>
          <button
            type="button"
            className="btn-primary"
            disabled={stock.soldOut}
            onClick={() => openCheckout({ kind: 'collection' })}
          >
            {stock.soldOut ? 'Sold out' : 'Buy collection'}
          </button>
        </div>
      </section>

      <section className="catalog">
        <p className="catalog-support">
          Cosmetics aren't just drip — every buy backs Astra Client. We put some of that money into making
          the client faster, cleaner, and harder to put down.
        </p>
        <div className="catalog-bar">
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
          <input
            className="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search cosmetics"
            aria-label="Search cosmetics"
          />
        </div>
        <div className="cape-grid">
          {list.map((cape) => (
            <CapeCard
              key={cape.id}
              cape={cape}
              owned={owns(cape.id)}
              onBuy={(item) => openCheckout({ kind: 'cape', cape: item })}
              onLink={openAccount}
            />
          ))}
        </div>
        {list.length === 0 && !wingHits ? <p className="empty">No cosmetics match that search.</p> : null}
      </section>

      {filter === 'all' ? (
      <WingsSection
        ownsWing={ownsWing}
        linked={Boolean(user)}
        query={query}
        onBuy={(wing) => openCheckout({ kind: 'wing', wing })}
        onLink={openAccount}
      />
      ) : null}
    </main>
  )
}
