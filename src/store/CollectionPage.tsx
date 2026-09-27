import { useOutletContext } from 'react-router-dom'
import { CAPES, COLLECTION_LAUNCH_PRICE, formatPrice, paidCapes } from './capes'
import { collectionPrice } from './api'
import { formatCollectionStock, useCollectionStock } from './collectionStock'
import type { StoreOutlet } from './StoreLayout'

export default function CollectionPage() {
  const { openCheckout, owns } = useOutletContext<StoreOutlet>()
  const ownedCount = CAPES.filter((cape) => owns(cape.id)).length
  const stock = useCollectionStock()

  return (
    <main className="store-main">
      <p className="kicker">Collection</p>
      <h1 className="page-title">All {paidCapes().length} paid cloaks. One unlock.</h1>
      <p className="hero-lead">
        Every paid cloak that ships in Astra Client, paid once for{' '}
        {formatPrice(COLLECTION_LAUNCH_PRICE)}. Astra-branded cloaks stay free. Every unlock
        funds the client — we put some of it back into making Astra better.
      </p>
      <div className="bundle-row">
        <div>
          <h2>{formatPrice(collectionPrice())}</h2>
          <p>
            {ownedCount === CAPES.length
              ? 'You already own the full collection.'
              : `${ownedCount} / ${CAPES.length} owned on this account`}
            {' · '}
            {formatCollectionStock(stock)}
          </p>
        </div>
        {ownedCount === CAPES.length ? null : (
          <button
            type="button"
            className="btn-primary"
            disabled={stock.soldOut}
            onClick={() => openCheckout({ kind: 'collection' })}
          >
            {stock.soldOut ? 'Sold out' : 'Unlock Entire Collection'}
          </button>
        )}
      </div>
      <ul className="collection-list">
        {CAPES.map((cape) => (
          <li key={cape.id}>
            <span>{cape.name}</span>
            <em>{owns(cape.id) ? 'Owned' : formatPrice(cape.price)}</em>
          </li>
        ))}
      </ul>
    </main>
  )
}
