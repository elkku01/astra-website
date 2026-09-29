import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPrice } from './capes'

type Props = {
  title: string
  price: number
  detail: string
  busy?: boolean
  needsAccount?: boolean
  soldOut?: boolean
  onConfirm: () => void
  onLink?: () => void
  onClose: () => void
}

export default function CheckoutModal({
  title,
  price,
  detail,
  busy,
  needsAccount,
  soldOut,
  onConfirm,
  onLink,
  onClose,
}: Props) {
  const [agreed, setAgreed] = useState(false)
  return (
    <div
      className={`modal-back ${busy ? 'buying' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-title"
    >
      <div className="modal">
        <p className="kicker">Checkout</p>
        <h2 id="checkout-title">{title}</h2>
        <p className="modal-lead">{detail}</p>
        <p className="modal-price">{formatPrice(price)}</p>
        <p className="modal-note">
          Secure checkout by Stripe, our reseller, which also handles VAT and sales tax. Card
          details never touch this site. Cloaks unlock on your linked Minecraft account.
        </p>
        <label className="modal-consent">
          <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
          <span>
            I agree to the <Link to="/legal#terms" target="_blank">Terms</Link> and want the cosmetic
            delivered immediately. I understand I lose my 14-day right of withdrawal once it is
            delivered (<Link to="/legal#purchases" target="_blank">details</Link>).
          </span>
        </label>
        {soldOut ? (
          <p className="error">This launch collection is sold out.</p>
        ) : null}
        {needsAccount ? (
          <p className="error">Link a Minecraft account before paying.</p>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {needsAccount && onLink ? (
            <button type="button" className="btn-primary" onClick={onLink}>
              Link account
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={onConfirm}
              disabled={busy || needsAccount || soldOut || !agreed}
            >
              {soldOut ? 'Sold out' : busy ? 'Unlocking…' : `Pay ${formatPrice(price)}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
