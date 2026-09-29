/**
 * Minimal Stripe client for the store (no SDK, so it runs on Cloudflare
 * Workers and in the Vite dev server alike).
 *
 * Payments use Stripe Managed Payments: Stripe is the merchant of record and
 * handles VAT/sales tax, fraud, disputes and customer payment support.
 */

const API = 'https://api.stripe.com/v1'
/** Managed Payments needs 2025-03-31.basil or later; managed_payments on Checkout shipped in dahlia. */
export const STRIPE_VERSION = '2026-04-22.dahlia'
/** "Video Games - downloaded - non subscription - with permanent rights": eligible for Managed Payments. */
export const CLOAK_TAX_CODE = 'txcd_10201000'
const SIGNATURE_TOLERANCE_S = 300

export type StripeRequest = (method: 'GET' | 'POST', path: string, form?: URLSearchParams) => Promise<Record<string, unknown>>

export type CheckoutSession = {
  id: string
  url?: string | null
  payment_status?: string
  status?: string
  payment_intent?: string | null
  client_reference_id?: string | null
  metadata?: Record<string, string>
}

export function stripeRequester(secretKey: string): StripeRequest {
  return async (method, path, form) => {
    if (!secretKey) throw new Error('Stripe is not configured on this server.')
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Stripe-Version': STRIPE_VERSION,
        ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: form ? form.toString() : undefined,
    })
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok) {
      const error = body.error as { message?: string } | undefined
      throw new Error(error?.message || `Stripe request failed (${response.status})`)
    }
    return body
  }
}

export type CheckoutLine = { name: string; description?: string; amountCents: number }

export function checkoutForm(opts: {
  lines: CheckoutLine[]
  successUrl: string
  cancelUrl: string
  clientReferenceId: string
  metadata: Record<string, string>
}): URLSearchParams {
  const form = new URLSearchParams()
  form.set('mode', 'payment')
  form.set('managed_payments[enabled]', 'true')
  form.set('success_url', opts.successUrl)
  form.set('cancel_url', opts.cancelUrl)
  form.set('client_reference_id', opts.clientReferenceId)
  opts.lines.forEach((line, i) => {
    const p = `line_items[${i}]`
    form.set(`${p}[quantity]`, '1')
    form.set(`${p}[price_data][currency]`, 'usd')
    form.set(`${p}[price_data][unit_amount]`, String(line.amountCents))
    // The listed price is the final price; tax is taken out of it, not added on top.
    form.set(`${p}[price_data][tax_behavior]`, 'inclusive')
    form.set(`${p}[price_data][product_data][name]`, line.name)
    form.set(`${p}[price_data][product_data][tax_code]`, CLOAK_TAX_CODE)
    if (line.description) form.set(`${p}[price_data][product_data][description]`, line.description)
  })
  for (const [key, value] of Object.entries(opts.metadata)) {
    form.set(`metadata[${key}]`, value)
    // Copy onto the PaymentIntent too, so refunds and disputes can be traced back.
    form.set(`payment_intent_data[metadata][${key}]`, value)
  }
  return form
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

/**
 * Verifies a Stripe-Signature header (t=timestamp,v1=hmac...) over the raw body.
 * Returns the parsed event, or null if the signature is missing, wrong or stale.
 */
export async function verifyStripeEvent(
  rawBody: string,
  header: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<Record<string, unknown> | null> {
  if (!secret || !header) return null
  let timestamp = ''
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2)
    if (key === 't') timestamp = value
    if (key === 'v1' && value) signatures.push(value)
  }
  const t = Number(timestamp)
  if (!Number.isFinite(t) || signatures.length === 0) return null
  if (Math.abs(nowSeconds - t) > SIGNATURE_TOLERANCE_S) return null
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`)))
  if (!signatures.some((sig) => safeEqual(sig, expected))) return null
  try {
    const event = JSON.parse(rawBody) as unknown
    return event && typeof event === 'object' ? (event as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Builds a valid Stripe-Signature header; used by tests and local webhook replays. */
export async function signStripePayload(rawBody: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`)))
  return `t=${timestamp},v1=${sig}`
}
