import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { CosmeticsStore, importLegacyStore, resetRateLimits, type StoreStorage } from '../server/storeCore.ts'
import { tebexWebhookSignature } from '../server/tebexWebhook.ts'
import { INVALID_MINECRAFT_ACCOUNT } from '../src/store/minecraftAccount.ts'

const ALICE = { username: 'Alice', uuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }
const BOB = { username: 'Bob', uuid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }
const SECRET = 'webhook-secret'
const PASSWORD = 'correct-horse-battery'

function memoryStorage(): StoreStorage & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>()
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0)) // force interleaving
  return {
    data,
    async get<T>(key: string) {
      await tick()
      return structuredClone(data.get(key)) as T | undefined
    },
    async put(key, value) {
      await tick()
      data.set(key, structuredClone(value))
    },
    async delete(key) {
      await tick()
      data.delete(key)
    },
  }
}

let mojang: Map<string, { username: string; uuid: string }>
let mojangDown: boolean
let baskets: Map<string, { complete: boolean; username?: string; packages: { slug: string }[] }>
let storage: ReturnType<typeof memoryStorage>
let store: CosmeticsStore

function makeStore() {
  return new CosmeticsStore({
    storage,
    config: {
      adminPassword: PASSWORD,
      tebexPublicToken: 'public',
      tebexWebhookSecret: SECRET,
      collectionSlug: 'collection',
      collectionLimit: 100,
      allowedOrigins: ['https://elkku01.github.io'],
    },
    resolveAccount: async (name) => {
      if (mojangDown) throw new Error('Could not check that Minecraft account right now.')
      const hit = mojang.get(name.toLowerCase())
      if (!hit) throw new Error(INVALID_MINECRAFT_ACCOUNT)
      return hit
    },
    fetchBasket: async (ident) => baskets.get(ident) || null,
  })
}

beforeEach(() => {
  resetRateLimits()
  mojang = new Map([
    ['alice', ALICE],
    ['bob', BOB],
  ])
  mojangDown = false
  baskets = new Map()
  storage = memoryStorage()
  store = makeStore()
})

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const response = await store.handle(
    new Request(`https://store.test${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }),
    '198.51.100.7',
  )
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

const owned = async (uuid: string) =>
  (await call('GET', `/api/cosmetics/owned?uuid=${uuid}`)).body.ownedCapeIds as string[]

test('a paid basket can only be claimed by one account (no replay)', async () => {
  baskets.set('basket-without-name', { complete: true, packages: [{ slug: 'gojo' }] })

  const first = await call('POST', '/api/cosmetics/claim', { ident: 'basket-without-name', username: 'Alice' })
  assert.equal(first.status, 200)
  assert.ok((await owned(ALICE.uuid)).includes('gojo'))

  const replay = await call('POST', '/api/cosmetics/claim', { ident: 'basket-without-name', username: 'Bob' })
  assert.equal(replay.status, 409)
  assert.ok(!(await owned(BOB.uuid)).includes('gojo'))

  // The rightful owner refreshing the return page still works.
  const again = await call('POST', '/api/cosmetics/claim', { ident: 'basket-without-name', username: 'Alice' })
  assert.equal(again.status, 200)
})

test('racing claims of one basket for different accounts: exactly one wins', async () => {
  baskets.set('race-basket-1', { complete: true, packages: [{ slug: 'miku' }] })
  const results = await Promise.all([
    call('POST', '/api/cosmetics/claim', { ident: 'race-basket-1', username: 'Alice' }),
    call('POST', '/api/cosmetics/claim', { ident: 'race-basket-1', username: 'Bob' }),
  ])
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409])
  const winners = [(await owned(ALICE.uuid)).includes('miku'), (await owned(BOB.uuid)).includes('miku')]
  assert.equal(winners.filter(Boolean).length, 1)
})

test('basket username wins over the requested username', async () => {
  baskets.set('named-basket', { complete: true, username: 'Alice', packages: [{ slug: 'gojo' }] })
  const res = await call('POST', '/api/cosmetics/claim', { ident: 'named-basket', username: 'Bob' })
  assert.equal(res.status, 403)
})

test('concurrent grants to one player are never lost', async () => {
  const ids = ['torii', 'gojo', 'ash', 'goated', 'shadow', 'spidey', 'swag', 'benjamin']
  await Promise.all(ids.map((id) => store.grant(ALICE, [id], false)))
  const mine = await owned(ALICE.uuid)
  for (const id of ids) assert.ok(mine.includes(id), `${id} was lost`)
})

test('ownership follows the UUID, not the name (name change)', async () => {
  await store.grant(ALICE, ['gojo'], false)
  // Alice renames; a new player takes the name "Alice".
  const newcomer = { username: 'Alice', uuid: 'cccccccc-cccc-cccc-cccc-cccccccccccc' }
  mojang.set('alice', newcomer)
  const theirs = await call('GET', `/api/cosmetics/owned?uuid=${newcomer.uuid}&username=Alice`)
  assert.ok(!(theirs.body.ownedCapeIds as string[]).includes('gojo'))
  assert.ok((await owned(ALICE.uuid)).includes('gojo'))
})

test('unpaid or unknown baskets grant nothing; Mojang outage fails closed', async () => {
  baskets.set('not-paid-yet', { complete: false, username: 'Alice', packages: [{ slug: 'gojo' }] })
  assert.equal((await call('POST', '/api/cosmetics/claim', { ident: 'not-paid-yet' })).status, 409)
  assert.equal((await call('POST', '/api/cosmetics/claim', { ident: 'no-such-basket' })).status, 409)

  baskets.set('paid-basket', { complete: true, username: 'Alice', packages: [{ slug: 'gojo' }] })
  mojangDown = true
  assert.equal((await call('POST', '/api/cosmetics/claim', { ident: 'paid-basket' })).status, 503)
  mojangDown = false
  assert.equal((await call('POST', '/api/cosmetics/claim', { ident: 'paid-basket' })).status, 200)
})

test('webhook: unsigned or forged payloads are rejected, signed ones grant', async () => {
  const payload = JSON.stringify({
    type: 'payment.completed',
    id: 'evt-1',
    subject: {
      transaction_id: 'tbx-1',
      customer: { username: { username: 'Bob', id: BOB.uuid.replace(/-/g, '') } },
      products: [{ slug: 'miku', name: 'Miku cloak' }],
    },
  })
  assert.equal((await call('POST', '/api/webhooks/tebex', payload)).status, 401)
  assert.equal((await call('POST', '/api/webhooks/tebex', payload, { 'X-Signature': 'ab'.repeat(32) })).status, 401)
  const signature = await tebexWebhookSignature(payload, SECRET)
  const ok = await call('POST', '/api/webhooks/tebex', payload, { 'X-Signature': signature })
  assert.equal(ok.status, 200)
  assert.ok((await owned(BOB.uuid)).includes('miku'))
})

test('admin endpoints need a session; wrong password is rejected', async () => {
  assert.equal((await call('POST', '/api/admin/grant', { username: 'Bob', capeIds: ['gojo'] })).status, 401)
  assert.equal((await call('GET', '/api/admin/players')).status, 401)
  assert.equal((await call('POST', '/api/admin/login', { password: 'nope-nope' })).status, 401)
  const login = await call('POST', '/api/admin/login', { password: PASSWORD })
  const auth = { Authorization: `Bearer ${login.body.token}` }
  assert.equal((await call('POST', '/api/admin/grant', { username: 'Bob', capeIds: ['gojo'] }, auth)).status, 200)
  const players = await call('GET', '/api/admin/players', undefined, auth)
  assert.deepEqual(
    (players.body.players as { username: string }[]).map((p) => p.username),
    ['Bob'],
  )
  const revoked = await call('POST', '/api/admin/revoke', { username: 'Bob', capeIds: ['gojo'] }, auth)
  assert.ok(!(revoked.body.ownedCapeIds as string[]).includes('gojo'))
  await call('POST', '/api/admin/logout', undefined, auth)
  assert.equal((await call('GET', '/api/admin/players', undefined, auth)).status, 401)
})

test('collection stock counts each paying player once, never admin grants', async () => {
  baskets.set('collection-a1', { complete: true, username: 'Alice', packages: [{ slug: 'collection' }] })
  baskets.set('collection-a2', { complete: true, username: 'Alice', packages: [{ slug: 'collection' }] })
  await call('POST', '/api/cosmetics/claim', { ident: 'collection-a1' })
  await call('POST', '/api/cosmetics/claim', { ident: 'collection-a2' })
  await call('POST', '/api/collection-sale', { ident: 'collection-a1' })
  await store.adminGrant('Bob', [], true)
  const stock = await call('GET', '/api/collection-stock')
  assert.equal(stock.body.sold, 1)
})

test('legacy name-only records move to a UUID only when Mojang confirms it', async () => {
  const fresh = memoryStorage()
  await importLegacyStore(fresh, {
    byUuid: { [ALICE.uuid.replace(/-/g, '')]: { uuid: ALICE.uuid, username: 'Alice', ownedCapeIds: ['torii'] } },
    byName: { bob: { uuid: '', username: 'Bob', ownedCapeIds: ['gojo'] } },
    collectionSold: 3,
  })
  storage = fresh
  store = makeStore()
  assert.ok((await owned(ALICE.uuid)).includes('torii'))

  // Someone claiming Bob's legacy purchases with their own UUID gets nothing.
  const thief = await call('GET', `/api/cosmetics/owned?uuid=${ALICE.uuid}&username=Bob`)
  assert.ok(!(thief.body.ownedCapeIds as string[]).includes('gojo'))

  // Bob, whose name Mojang maps to his UUID, gets them.
  const bob = await call('GET', `/api/cosmetics/owned?uuid=${BOB.uuid}&username=Bob`)
  assert.ok((bob.body.ownedCapeIds as string[]).includes('gojo'))
  assert.equal(fresh.data.has('legacy-name:bob'), false)
  assert.equal((await call('GET', '/api/collection-stock')).body.sold, 3)
})

test('direct grant endpoints stay closed', async () => {
  assert.equal((await call('POST', '/api/cosmetics/grant', { username: 'Bob', ownedCapeIds: ['gojo'] })).status, 403)
})
