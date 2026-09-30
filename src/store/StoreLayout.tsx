import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { startLauncherDownload } from '../download'
import { collectionPrice, ownsCape } from './api'
import { getCape, isFreeCape, paidCapes, type Cape } from './capes'
import AccountMenu from './AccountMenu'
import CheckoutModal from './CheckoutModal'
import AdminDock from './AdminDock'
import { useSession } from './session'
import { startCheckout } from './checkout'
import type { Wing } from './wings'
import { formatCollectionStock, useCollectionStock } from './collectionStock'
import './Store.css'

function asset(path: string) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
}

export type CheckoutTarget =
  | { kind: 'cape'; cape: Cape }
  | { kind: 'collection' }
  | { kind: 'wing'; wing: Wing }

export type StoreOutlet = {
  openCheckout: (target: CheckoutTarget) => void
  openAccount: () => void
  owns: (id: string) => boolean
  ownsWing: (id: string) => boolean
}

export default function StoreLayout() {
  const { user } = useSession()
  const location = useLocation()
  const [checkout, setCheckout] = useState<CheckoutTarget | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const stock = useCollectionStock()

  useEffect(() => {
    if (searchParams.get('link') !== '1') return
    setAccountOpen(true)
    const next = new URLSearchParams(searchParams)
    next.delete('link')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    document.title = 'Astra Cloaks'
    return () => {
      document.title = 'Astra — Launcher + Client'
    }
  }, [])

  async function confirm() {
    if (!checkout) return
    if (!user) {
      setCheckout(null)
      setAccountOpen(true)
      return
    }
    if (checkout.kind === 'wing' && !checkout.wing.purchasable) {
      setCheckout(null)
      return
    }
    if (checkout.kind === 'cape' && isFreeCape(checkout.cape)) {
      setCheckout(null)
      return
    }
    if (checkout.kind === 'collection' && stock.soldOut) {
      setNotice('The launch collection is sold out.')
      setCheckout(null)
      return
    }
    setBusy(true)
    try {
      await startCheckout({
        username: user.username,
        capeIds: checkout.kind === 'cape' ? [checkout.cape.id] : [],
        collection: checkout.kind === 'collection',
        wingIds: checkout.kind === 'wing' ? [checkout.wing.id] : [],
      })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not open checkout')
      setBusy(false)
    }
  }

  const cape = checkout?.kind === 'cape' ? checkout.cape : getCape('')
  const checkoutTitle =
    checkout?.kind === 'wing'
      ? checkout.wing.name
      : checkout?.kind === 'collection'
        ? 'Unlock entire collection'
        : cape?.name || ''
  const checkoutPrice =
    checkout?.kind === 'wing' ? checkout.wing.price : checkout?.kind === 'collection' ? collectionPrice() : cape?.price || 0
  const checkoutDetail =
    checkout?.kind === 'wing'
      ? `${checkout.wing.blurb} Unlocks in Astra Client on your linked Minecraft account.`
      : checkout?.kind === 'collection'
      ? `All ${paidCapes().length} paid cloaks from the Astra client, assigned after payment. ${formatCollectionStock(stock)}. Astra-branded cloaks stay free.`
      : cape?.blurb || ''

  return (
    <div className="store-page">
      <header className="store-nav">
        <Link className="brand" to="/" viewTransition>
          <img src={asset('/images/astra-mark.png')} alt="" width={28} height={28} />
          ASTRA
        </Link>
        <nav className="store-links" aria-label="Store">
          <NavLink to="/store" end viewTransition>
            Store
          </NavLink>
          <NavLink to="/store/my-capes" viewTransition>
            My Cloaks
          </NavLink>
          <NavLink to="/status" viewTransition>
            Status
          </NavLink>
          <button type="button" className="text-link" onClick={() => void startLauncherDownload()}>
            Download Client
          </button>
        </nav>
        <AccountMenu open={accountOpen} onOpenChange={setAccountOpen} />
      </header>

      {notice ? (
        <div className="store-banner">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="page-enter" key={location.pathname}>
        <Outlet
          context={
            {
              openCheckout: setCheckout,
              openAccount: () => setAccountOpen(true),
              owns: (id: string) => ownsCape(user, id),
              ownsWing: (id: string) => Boolean(user?.ownedWingIds?.includes(id)),
            } satisfies StoreOutlet
          }
        />
      </div>

      {checkout ? (
        <CheckoutModal
          title={checkoutTitle}
          price={checkoutPrice}
          detail={checkoutDetail}
          busy={busy}
          needsAccount={!user}
          soldOut={checkout.kind === 'collection' && stock.soldOut}
          onConfirm={() => void confirm()}
          onLink={() => {
            setCheckout(null)
            setAccountOpen(true)
          }}
          onClose={() => setCheckout(null)}
        />
      ) : null}
      <footer className="store-legal">
        <Link to="/legal#privacy">Privacy</Link>
        <Link to="/legal#terms">Terms</Link>
        <Link to="/legal#purchases">Purchases &amp; refunds</Link>
        <span>Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.</span>
      </footer>
      <AdminDock />
    </div>
  )
}
