import { getCape, paidCapes } from './capes'
import { fetchCollectionStock } from './collectionStock'
import { capeIdsFromPackages } from './fulfillment'

const PUBLIC_TOKEN = String(import.meta.env.VITE_TEBEX_PUBLIC_TOKEN || '').trim()
const STORE_URL = String(import.meta.env.VITE_TEBEX_STORE_URL || '').replace(/\/$/, '')
const COLLECTION_SLUG = String(import.meta.env.VITE_TEBEX_COLLECTION_SLUG || 'collection')
const PENDING_KEY = 'astra-tebex-basket'

type TebexPackage = {
  id: number
  name: string
  slug?: string | null
  total_price?: number
  base_price?: number
}

type TebexBasket = {
  ident: string
  complete: boolean
  username?: string | null
  custom?: Record<string, unknown> | null
  packages?: { id: number; name?: string; slug?: string }[]
  links?: { checkout?: string; payment?: string } | unknown[]
}

type TebexAuthLink = { name: string; url: string }

let packageCache: TebexPackage[] | null = null

export function isTebexConfigured(): boolean {
  return PUBLIC_TOKEN.length > 0 || STORE_URL.length > 0
}

export function hasTebexHeadless(): boolean {
  return PUBLIC_TOKEN.length > 0
}

function accountUrl(path: string): string {
  return `https://headless.tebex.io/api/accounts/${encodeURIComponent(PUBLIC_TOKEN)}${path}`
}

function tebexError(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const rec = body as {
      error?: { detail?: string; message?: string }
      message?: string
      title?: string
    }
    const raw = rec.error?.detail || rec.error?.message || rec.message || rec.title
    if (typeof raw === 'string' && raw.trim() && !/api\/accounts\//i.test(raw)) {
      return raw.replace(/tebex/gi, 'checkout')
    }
  }
  return `Checkout request failed (${status})`
}

async function tebexFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  const body = (await response.json().catch(() => null)) as
    | { data?: T }
    | T
    | null
  if (!response.ok) {
    throw new Error(tebexError(body, response.status))
  }
  if (body && typeof body === 'object' && 'data' in body && body.data !== undefined) {
    return body.data as T
  }
  return body as T
}

async function tebexJson<T>(path: string, init?: RequestInit): Promise<T> {
  return tebexFetch<T>(accountUrl(path), init)
}

function checkoutLink(basket: TebexBasket): string | undefined {
  const links = basket.links
  if (!links || Array.isArray(links)) return undefined
  return typeof links.checkout === 'string' ? links.checkout : undefined
}

export async function fetchTebexPackages(): Promise<TebexPackage[]> {
  if (!PUBLIC_TOKEN) return []
  if (packageCache) return packageCache
  const data = await tebexJson<TebexPackage[] | { data?: TebexPackage[] }>('/packages')
  const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
  packageCache = list
  return list
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function matchPackage(packages: TebexPackage[], slug: string): TebexPackage | undefined {
  const wanted = normalizeKey(slug)
  return packages.find((item) => {
    const name = String(item.name || '')
    const keys = [item.slug || '', name, name.replace(/\s*cloak\s*$/i, '')].map(normalizeKey)
    return keys.includes(wanted) || keys.includes(`${wanted}cloak`)
  })
}

export async function resolveTebexPackageIds(capeIds: string[]): Promise<number[]> {
  const packages = await fetchTebexPackages()
  if (!packages.length) {
    throw new Error('No packages were found in the store catalog.')
  }
  const buyingAll = capeIds.length === paidCapes().length
  if (buyingAll) {
    const bundle = matchPackage(packages, COLLECTION_SLUG)
    if (bundle) return [bundle.id]
  }
  const ids: number[] = []
  for (const capeId of capeIds) {
    const found = matchPackage(packages, capeId)
    if (!found) {
      const cape = getCape(capeId)
      throw new Error(
        `“${cape?.name || capeId}” is not available for purchase yet.`,
      )
    }
    ids.push(found.id)
  }
  return ids
}

function siteUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/'
  return new URL(path.replace(/^\//, ''), new URL(base, window.location.origin)).href
}

export function rememberBasket(ident: string) {
  try {
    sessionStorage.setItem(PENDING_KEY, ident)
    localStorage.setItem(PENDING_KEY, ident)
  } catch {
    // Private mode can block storage.
  }
}

export function takePendingBasket(): string | null {
  try {
    return sessionStorage.getItem(PENDING_KEY) || localStorage.getItem(PENDING_KEY)
  } catch {
    return null
  }
}

export function clearPendingBasket() {
  try {
    sessionStorage.removeItem(PENDING_KEY)
    localStorage.removeItem(PENDING_KEY)
  } catch {
    // Ignore storage failures.
  }
}

export async function getTebexBasket(ident: string): Promise<TebexBasket> {
  return tebexJson<TebexBasket>(`/baskets/${encodeURIComponent(ident)}`)
}

export function capeIdsFromBasket(basket: TebexBasket): string[] {
  return capeIdsFromPackages(basket.packages || [], COLLECTION_SLUG)
}

export async function startTebexCheckout(opts: {
  username: string
  capeIds: string[]
}): Promise<void> {
  if (!isTebexConfigured()) {
    throw new Error('Checkout is not connected. Restart the site after adding the store token.')
  }

  if (!PUBLIC_TOKEN && STORE_URL) {
    const slug = opts.capeIds.length >= paidCapes().length ? COLLECTION_SLUG : opts.capeIds[0]
    window.location.assign(`${STORE_URL}/package/${encodeURIComponent(slug)}`)
    return
  }

  const packageIds = await resolveTebexPackageIds(opts.capeIds)
  if (opts.capeIds.length === paidCapes().length) {
    const stock = await fetchCollectionStock()
    if (stock.soldOut) throw new Error('The launch collection is sold out.')
  }
  const completeUrl = siteUrl('store/checkout')
  const cancelUrl = siteUrl('store/checkout?cancelled=1')
  const basket = await tebexJson<TebexBasket>('/baskets', {
    method: 'POST',
    body: JSON.stringify({
      username: opts.username,
      complete_url: completeUrl,
      cancel_url: cancelUrl,
      complete_auto_redirect: true,
    }),
  })

  rememberBasket(basket.ident)
  const completeWithBasket = siteUrl(`store/checkout?basket=${encodeURIComponent(basket.ident)}`)

  for (const packageId of packageIds) {
    await tebexFetch(`https://headless.tebex.io/api/baskets/${encodeURIComponent(basket.ident)}/packages`, {
      method: 'POST',
      body: JSON.stringify({ package_id: packageId, quantity: 1 }),
    })
  }

  const updated = await getTebexBasket(basket.ident)
  const checkout = checkoutLink(updated)
  const returnUrl = checkout || completeWithBasket
  try {
    const auth = await tebexJson<TebexAuthLink[]>(
      `/baskets/${encodeURIComponent(basket.ident)}/auth?returnUrl=${encodeURIComponent(returnUrl)}`,
    )
    const link = Array.isArray(auth) ? auth[0]?.url : undefined
    if (link) {
      window.location.assign(link)
      return
    }
  } catch {
    // Some store types skip Minecraft auth and go straight to checkout.
  }

  if (checkout) {
    window.location.assign(checkout)
    return
  }

  throw new Error('Could not open checkout.')
}
