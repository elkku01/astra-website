import type { BasketPackage } from '../src/store/fulfillment.ts'

export const TEBEX_WEBHOOK_IPS = new Set(['18.209.80.3', '54.87.231.232'])

export type TebexWebhookPayment = {
  kind: 'payment'
  username: string
  uuid: string
  packages: BasketPackage[]
  transactionId: string
}

export type TebexWebhookResult =
  | { kind: 'validation'; id: string }
  | TebexWebhookPayment
  | { kind: 'ignored'; type: string }
  | { kind: 'unauthorized' }
  | { kind: 'invalid' }

function toHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function bytesFromHex(hex: string) {
  const clean = hex.trim().toLowerCase()
  if (!clean || clean.length % 2) return new Uint8Array()
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    const value = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(value)) return new Uint8Array()
    out[i] = value
  }
  return out
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length || a.length === 0) return false
  let out = 0
  for (let i = 0; i < a.length; i += 1) out |= a[i] ^ b[i]
  return out === 0
}

export async function tebexWebhookSignature(rawBody: string, secret: string) {
  const bodyHash = toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawBody))))
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(bodyHash))
  return toHex(new Uint8Array(signature))
}

async function signatureMatches(rawBody: string, header: string, secret: string) {
  if (!secret || !header) return false
  const expected = bytesFromHex(await tebexWebhookSignature(rawBody, secret))
  const given = bytesFromHex(header)
  return timingSafeEqual(expected, given)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function usernameFrom(value: unknown) {
  const record = asRecord(value)
  const nested = asRecord(record?.username)
  return String(nested?.username || record?.username || '').trim()
}

function uuidFrom(value: unknown) {
  const record = asRecord(value)
  const nested = asRecord(record?.username)
  const raw = String(nested?.id || record?.id || '').replace(/-/g, '').toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(raw)) return ''
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`
}

function packagesFromProducts(products: unknown): BasketPackage[] {
  if (!Array.isArray(products)) return []
  return products.map((item) => {
    const record = asRecord(item) || {}
    return {
      slug: record.slug ? String(record.slug) : null,
      name: record.name ? String(record.name) : null,
    }
  })
}

export async function inspectTebexWebhook(opts: {
  rawBody: string
  signature: string
  ip: string
  secret: string
}): Promise<TebexWebhookResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(opts.rawBody)
  } catch {
    return { kind: 'invalid' }
  }
  const body = asRecord(parsed)
  if (!body) return { kind: 'invalid' }

  const type = String(body.type || '')
  const id = String(body.id || '')
  const signed = await signatureMatches(opts.rawBody, opts.signature, opts.secret)

  if (opts.secret) {
    if (!signed) return { kind: 'unauthorized' }
  } else if (type !== 'validation.webhook') {
    return { kind: 'unauthorized' }
  }

  if (type === 'validation.webhook') {
    return id ? { kind: 'validation', id } : { kind: 'invalid' }
  }

  if (type !== 'payment.completed') {
    return { kind: 'ignored', type: type || 'unknown' }
  }

  const subject = asRecord(body.subject) || {}
  const products = Array.isArray(subject.products) ? subject.products : []
  const username =
    usernameFrom(subject.customer) ||
    usernameFrom(asRecord(products[0])) ||
    ''
  const uuid = uuidFrom(subject.customer) || uuidFrom(asRecord(products[0]))
  return {
    kind: 'payment',
    username,
    uuid,
    packages: packagesFromProducts(products),
    transactionId: String(subject.transaction_id || id),
  }
}
