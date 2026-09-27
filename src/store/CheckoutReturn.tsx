import { useEffect, useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CAPES } from './capes'
import CapeThumb from './CapeThumb'
import { useSession } from './session'

type Phase = 'checking' | 'success' | 'pending' | 'cancelled' | 'error'

function UnlockMark() {
  return (
    <div className="unlock-mark" aria-hidden="true">
      <span className="unlock-burst" />
      {Array.from({ length: 12 }, (_, index) => (
        <span key={index} className="unlock-spark" style={{ '--i': index } as CSSProperties} />
      ))}
      <svg viewBox="0 0 96 96">
        <circle className="unlock-ring" cx="48" cy="48" r="36" />
        <path className="unlock-check" d="M30 49.5 42.5 62 67 35" />
      </svg>
    </div>
  )
}

export default function CheckoutReturn() {
  const [params] = useSearchParams()
  const cancelled = params.get('cancelled') === '1'
  const basket = params.get('basket') || params.get('basket-ident') || undefined
  const { applyPurchase, user } = useSession()
  const [phase, setPhase] = useState<Phase>(cancelled ? 'cancelled' : 'checking')

  useEffect(() => {
    if (cancelled) return
    let alive = true
    let attempts = 0
    const confirm = async () => {
      while (alive && attempts < 15) {
        attempts += 1
        try {
          const result = await applyPurchase(basket)
          if (!alive) return
          if (result.complete && result.granted.length > 0) {
            setPhase('success')
            return
          }
          if (result.complete && result.granted.length === 0) {
            setPhase('error')
            return
          }
        } catch {
          if (!alive) return
          setPhase('error')
          return
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2000))
      }
      if (alive) setPhase('pending')
    }
    void confirm()
    return () => {
      alive = false
    }
  }, [applyPurchase, basket, cancelled])

  const owned = user ? CAPES.filter((cape) => user.ownedCapeIds.includes(cape.id)).slice(0, 6) : []
  const copy =
    phase === 'cancelled'
      ? {
          kicker: 'Checkout',
          title: 'Payment cancelled',
          lead: 'Nothing was charged. You can go back and try again whenever you want.',
        }
      : phase === 'error'
        ? {
            kicker: 'Checkout',
            title: 'Could not confirm',
            lead: 'Refresh this page in a moment. If you paid, the cloaks will still land on your linked account.',
          }
        : phase === 'pending'
          ? {
              kicker: 'Checkout',
              title: 'Almost there',
              lead: 'Payment can take a few seconds to clear. Refresh this page if your cloaks are not listed yet.',
            }
          : phase === 'checking'
            ? {
                kicker: 'Checkout',
                title: 'Confirming',
                lead: 'Checking your payment…',
              }
            : {
                kicker: 'Purchase complete',
                title: 'Unlocked',
                lead: user
                  ? `${user.ownedCapeIds.length} cloaks are now on ${user.username}.`
                  : 'Your cloaks are tied to the Minecraft account you paid with.',
              }

  return (
    <main className={`store-main checkout-result ${phase}`}>
      <div className="checkout-stage">
        {phase === 'success' ? <UnlockMark /> : <div className={`checkout-status-dot ${phase}`} />}
        <p className="kicker">{copy.kicker}</p>
        <h1 className="page-title">{copy.title}</h1>
        <p className="hero-lead">{copy.lead}</p>
        {phase === 'success' && owned.length > 0 ? (
          <ul className="unlock-thumbs">
            {owned.map((cape) => (
              <li key={cape.id}>
                <CapeThumb cape={cape} />
              </li>
            ))}
          </ul>
        ) : null}
        <div className="checkout-actions">
          {phase === 'success' || phase === 'pending' ? (
            <Link className="btn-primary btn-xl" to="/store/my-capes" viewTransition>
              View your cloaks
            </Link>
          ) : null}
          <Link className={phase === 'success' ? 'btn-ghost' : 'btn-primary'} to="/store" viewTransition>
            Back to store
          </Link>
        </div>
      </div>
    </main>
  )
}
