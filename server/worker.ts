import { CosmeticsStore, importLegacyStore, type StoreStorage } from './storeCore.ts'

export interface Env {
  STORE_DB: DurableObjectNamespace
  /** Old single-blob KV store. Read once to migrate, never written again. */
  STORE?: KVNamespace
  ADMIN_PASSWORD?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  SITE_URL?: string
  COLLECTION_LIMIT?: string
}

const ALLOWED_ORIGINS = [
  'https://elkku01.github.io',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
]
const LEGACY_KV_KEY = 'cosmetics-owned'

/**
 * All store traffic goes to one Durable Object. Unlike KV, its storage is
 * strongly consistent and its writes are serialized, so concurrent purchases
 * can no longer overwrite each other.
 */
export class StoreDB {
  private store: CosmeticsStore
  private ready: Promise<void>

  constructor(ctx: DurableObjectState, env: Env) {
    const storage: StoreStorage = {
      get: (key) => ctx.storage.get(key),
      put: (key, value) => ctx.storage.put(key, value),
      delete: async (key) => {
        await ctx.storage.delete(key)
      },
    }
    this.store = new CosmeticsStore({
      storage,
      config: {
        adminPassword: env.ADMIN_PASSWORD || '',
        stripeSecretKey: env.STRIPE_SECRET_KEY || '',
        stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
        siteUrl: env.SITE_URL || 'https://elkku01.github.io/astra-website',
        collectionLimit: Math.max(1, Number(env.COLLECTION_LIMIT || 100) || 100),
        allowedOrigins: ALLOWED_ORIGINS,
      },
    })
    this.ready = ctx.blockConcurrencyWhile(async () => {
      if (await ctx.storage.get('meta:migrated')) return
      const raw = env.STORE ? await env.STORE.get(LEGACY_KV_KEY) : null
      let legacy = null
      try {
        legacy = raw ? JSON.parse(raw) : null
      } catch {
        legacy = null
      }
      await importLegacyStore(storage, legacy)
    })
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready
    return this.store.handle(request, request.headers.get('CF-Connecting-IP') || 'unknown')
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return env.STORE_DB.get(env.STORE_DB.idFromName('astra-store')).fetch(request)
  },
}
