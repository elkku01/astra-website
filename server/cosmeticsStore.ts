import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'
import { CosmeticsStore, importLegacyStore, type StoreStorage } from './storeCore.ts'

/**
 * Dev/preview host for the same store API the production Worker serves.
 * Data lives only in .data/ (gitignored). Nothing is written to public/,
 * so a local build can never publish ownership data.
 */
const DB_FILE = path.resolve('.data/store-db.json')
const LEGACY_FILE = path.resolve('.data/cosmetics-owned.json')
const MAX_BODY = 32 * 1024

function fileStorage(file: string): StoreStorage {
  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch {
    data = {}
  }
  const flush = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const temp = `${file}.tmp`
    fs.writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8')
    fs.renameSync(temp, file)
  }
  return {
    get: async <T,>(key: string) => structuredClone(data[key]) as T | undefined,
    put: async (key, value) => {
      data[key] = structuredClone(value)
      flush()
    },
    delete: async (key) => {
      delete data[key]
      flush()
    },
  }
}

function readLegacy() {
  try {
    return JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf8'))
  } catch {
    return null
  }
}

function toRequest(req: IncomingMessage, body: Buffer | null): Request {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value)
    else if (Array.isArray(value)) headers.set(key, value.join(', '))
  }
  return new Request(`http://${req.headers.host || '127.0.0.1'}${req.url || '/'}`, {
    method: req.method,
    headers,
    body: body && req.method !== 'GET' && req.method !== 'HEAD' ? new Uint8Array(body) : undefined,
  })
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('payload-too-large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function sendResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  res.end(Buffer.from(await response.arrayBuffer()))
}

function isStorePath(url = '') {
  const pathname = url.split('?')[0]
  return pathname.startsWith('/api/') || pathname === '/v1/cosmetics' || pathname.startsWith('/v1/cosmetics/')
}

export function cosmeticsStoreApi(
  options: {
    adminPassword?: string
    stripeSecretKey?: string
    stripeWebhookSecret?: string
    siteUrl?: string
    collectionLimit?: number
  } = {},
): Plugin {
  let store: Promise<CosmeticsStore> | null = null
  const getStore = () => {
    if (!store) {
      store = (async () => {
        const storage = fileStorage(DB_FILE)
        await importLegacyStore(storage, readLegacy())
        return new CosmeticsStore({
          storage,
          config: {
            adminPassword: options.adminPassword || '',
            stripeSecretKey: options.stripeSecretKey || '',
            stripeWebhookSecret: options.stripeWebhookSecret || '',
            siteUrl: options.siteUrl || 'http://localhost:5173',
            collectionLimit: options.collectionLimit && options.collectionLimit > 0 ? options.collectionLimit : 100,
            allowedOrigins: [
              'http://127.0.0.1:5173',
              'http://localhost:5173',
              'http://127.0.0.1:4173',
              'http://localhost:4173',
            ],
          },
        })
      })()
    }
    return store
  }

  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    if (!isStorePath(req.url)) {
      next()
      return
    }
    void (async () => {
      try {
        const body = req.method === 'GET' || req.method === 'HEAD' ? null : await readBody(req)
        const response = await (await getStore()).handle(
          toRequest(req, body),
          String(req.socket.remoteAddress || 'unknown'),
        )
        await sendResponse(res, response)
      } catch (error) {
        const tooLarge = error instanceof Error && error.message === 'payload-too-large'
        res.statusCode = tooLarge ? 413 : 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: tooLarge ? 'Request is too large.' : 'store-error' }))
      }
    })()
  }

  return {
    name: 'astra-cosmetics-store',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
