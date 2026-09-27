import { useEffect, useState } from 'react'
import { COLLECTION_LIMIT } from './capes'
import { storeApiUrl } from './storeApi'

export type CollectionStock = {
  limit: number
  remaining: number | null
  soldOut: boolean
}

export function formatCollectionStock(stock: CollectionStock): string {
  if (stock.soldOut) return 'Sold out'
  if (stock.remaining == null) return `Limited to ${stock.limit}`
  return `${stock.remaining} of ${stock.limit} left`
}

export async function fetchCollectionStock(): Promise<CollectionStock> {
  try {
    const response = await fetch(storeApiUrl('/api/collection-stock'), {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error('stock-unavailable')
    const body = (await response.json()) as { limit?: number; remaining?: number; sold?: number }
    const limit = Number(body.limit) > 0 ? Number(body.limit) : COLLECTION_LIMIT
    const remaining = Math.max(0, Number(body.remaining ?? limit - Number(body.sold || 0)))
    return { limit, remaining, soldOut: remaining <= 0 }
  } catch {
    return { limit: COLLECTION_LIMIT, remaining: null, soldOut: false }
  }
}

export async function recordCollectionSale(ident: string): Promise<void> {
  try {
    await fetch(storeApiUrl('/api/collection-sale'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ident }),
    })
  } catch {
    // Remaining count updates on the next stock refresh if this fails.
  }
}

export function useCollectionStock(): CollectionStock {
  const [stock, setStock] = useState<CollectionStock>({
    limit: COLLECTION_LIMIT,
    remaining: null,
    soldOut: false,
  })

  useEffect(() => {
    let alive = true
    const pull = () => {
      void fetchCollectionStock().then((next) => {
        if (alive) setStock(next)
      })
    }
    pull()
    const timer = window.setInterval(pull, 20000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') pull()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', pull)
    return () => {
      alive = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', pull)
    }
  }, [])

  return stock
}
