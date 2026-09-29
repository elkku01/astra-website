import { storeApiUrl } from './storeApi'

/**
 * Checkout goes through the store API, which creates a Stripe Checkout
 * session (Stripe Managed Payments: Stripe is the merchant of record and
 * handles VAT/sales tax). Prices are decided on the server.
 */
export async function startCheckout(opts: { username: string; capeIds: string[]; collection: boolean }) {
  const response = await fetch(storeApiUrl('/api/checkout'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(opts),
  })
  const body = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
  if (!response.ok || !body.url) {
    throw new Error(body.error || 'Could not open checkout. Try again in a moment.')
  }
  window.location.assign(body.url)
}

export type CheckoutStatus = { complete: boolean; granted: string[]; username?: string; uuid?: string }

export async function fetchCheckoutStatus(sessionId: string): Promise<CheckoutStatus> {
  const response = await fetch(
    storeApiUrl(`/api/checkout/status?session_id=${encodeURIComponent(sessionId)}`),
    { headers: { Accept: 'application/json' } },
  )
  const body = (await response.json().catch(() => ({}))) as Partial<CheckoutStatus> & { error?: string }
  if (!response.ok) throw new Error(body.error || 'Could not confirm the payment.')
  return {
    complete: Boolean(body.complete),
    granted: Array.isArray(body.granted) ? body.granted.filter((id): id is string => typeof id === 'string') : [],
    username: typeof body.username === 'string' ? body.username : undefined,
    uuid: typeof body.uuid === 'string' ? body.uuid : undefined,
  }
}
