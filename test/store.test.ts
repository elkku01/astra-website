import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { CosmeticsStore, importLegacyStore, resetRateLimits, type StoreStorage } from '../server/storeCore.ts'
import { signStripePayload, verifyStripeEvent, type CheckoutSession } from '../server/stripe.ts'
import { INVALID_MINECRAFT_ACCOUNT } from '../src/store/minecraftAccount.ts'
import { CAPES, COLLECTION_LAUNCH_PRICE, paidCapes } from '../src/store/capes.ts'

const ALICE = { username: 'Alice', uuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }
const BOB = { username: 'Bob', uuid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }
const WHSEC = 'whsec_test_secret'
const PASSWORD = 'correct-horse-battery'
const PAID = paidCapes()[0]
const INTERNAL_KEY = 'i'.repeat(48)

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
let storage: ReturnType<typeof memoryStorage>
let store: CosmeticsStore
// fake Stripe: created sessions, and the last form we sent
let sessions: Map<string, CheckoutSession>
let lastForm: URLSearchParams | null
let seq = 0

function makeStore() {
  return new CosmeticsStore({
    storage,
    config: {
      adminPassword: PASSWORD,
      stripeSecretKey: 'sk_test_x',
      stripeWebhookSecret: WHSEC,
      siteUrl: 'https://example.test/astra-website',
      collectionLimit: 100,
      allowedOrigins: ['https://example.test'],
      internalKey: INTERNAL_KEY,
    },
    resolveAccount: async (name) => {
      if (mojangDown) throw new Error('Could not check that Minecraft account right now.')
      const hit = mojang.get(name.toLowerCase())
      if (!hit) throw new Error(INVALID_MINECRAFT_ACCOUNT)
      return hit
    },
    stripe: async (method, path, form) => {
      if (method === 'POST' && path === '/checkout/sessions') {
        lastForm = form || null
        const id = `cs_test_${String(++seq).padStart(12, '0')}`
        const metadata: Record<string, string> = {}
        form?.forEach((value, key) => {
          const m = key.match(/^metadata\[(.+)\]$/)
          if (m) metadata[m[1]] = value
        })
        const session: CheckoutSession = { id, url: `https://checkout.stripe.test/${id}`, payment_status: 'unpaid', metadata, payment_intent: `pi_${seq}` }
        sessions.set(id, session)
        return session as unknown as Record<string, unknown>
      }
      const m = path.match(/^\/checkout\/sessions\/(.+)$/)
      if (method === 'GET' && m && sessions.has(decodeURIComponent(m[1]))) {
        return sessions.get(decodeURIComponent(m[1])) as unknown as Record<string, unknown>
      }
      throw new Error('No such checkout session')
    },
  })
}

beforeEach(() => {
  resetRateLimits()
  mojang = new Map([
    ['alice', ALICE],
    ['bob', BOB],
  ])
  mojangDown = false
  storage = memoryStorage()
  sessions = new Map()
  lastForm = null
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

async function buy(username: string, capeIds: string[], collection = false) {
  const res = await call('POST', '/api/checkout', { username, capeIds, collection })
  assert.equal(res.status, 200, JSON.stringify(res.body))
  const session = sessions.get(String(res.body.id))!
  session.payment_status = 'paid' // customer paid on Stripe
  return session
}

async function webhook(type: string, object: unknown) {
  const raw = JSON.stringify({ id: `evt_${++seq}`, type, data: { object } })
  return call('POST', '/api/webhooks/stripe', raw, { 'Stripe-Signature': await signStripePayload(raw, WHSEC) })
}

test('checkout uses server prices, Managed Payments and the verified account', async () => {
  const res = await call('POST', '/api/checkout', { username: 'alice', capeIds: [PAID.id, 'not-a-cape'], collection: false })
  assert.equal(res.status, 200)
  assert.match(String(res.body.url), /^https:\/\/checkout\.stripe\.test\//)
  assert.equal(lastForm!.get('managed_payments[enabled]'), 'true')
  assert.equal(lastForm!.get('line_items[0][price_data][unit_amount]'), String(Math.round(PAID.price * 100)))
  assert.equal(lastForm!.get('line_items[0][price_data][tax_behavior]'), 'inclusive')
  assert.equal(lastForm!.get('line_items[0][price_data][product_data][tax_code]'), 'txcd_10201000')
  assert.equal(lastForm!.get('line_items[1][quantity]'), null, 'unknown cape ids are dropped')
  assert.equal(lastForm!.get('metadata[uuid]'), ALICE.uuid.replace(/-/g, ''))
  assert.equal(lastForm!.get('metadata[username]'), 'Alice', 'name comes from Mojang, not the request')
  assert.equal(lastForm!.get('success_url'), 'https://example.test/astra-website/store/checkout?session_id={CHECKOUT_SESSION_ID}')
})

test('collection checkout charges the collection price', async () => {
  await call('POST', '/api/checkout', { username: 'Bob', capeIds: [], collection: true })
  assert.equal(lastForm!.get('line_items[0][price_data][unit_amount]'), String(Math.round(COLLECTION_LAUNCH_PRICE * 100)))
  assert.equal(lastForm!.get('line_items[1][quantity]'), null)
})

test('cannot pay for cloaks you already own; unknown players are rejected', async () => {
  await store.grant(ALICE, [PAID.id], false)
  assert.equal((await call('POST', '/api/checkout', { username: 'Alice', capeIds: [PAID.id] })).status, 409)
  assert.equal((await call('POST', '/api/checkout', { username: 'Nobody', capeIds: [PAID.id] })).status, 400)
  mojangDown = true
  assert.equal((await call('POST', '/api/checkout', { username: 'Bob', capeIds: [PAID.id] })).status, 503)
})

test('webhook: forged or stale signatures are rejected; a paid session grants', async () => {
  const session = await buy('Alice', [PAID.id])
  const raw = JSON.stringify({ type: 'checkout.session.completed', data: { object: session } })
  assert.equal((await call('POST', '/api/webhooks/stripe', raw)).status, 400)
  assert.equal((await call('POST', '/api/webhooks/stripe', raw, { 'Stripe-Signature': await signStripePayload(raw, 'whsec_wrong') })).status, 400)
  const stale = await signStripePayload(raw, WHSEC, Math.floor(Date.now() / 1000) - 3600)
  assert.equal((await call('POST', '/api/webhooks/stripe', raw, { 'Stripe-Signature': stale })).status, 400)
  assert.ok(!(await owned(ALICE.uuid)).includes(PAID.id))

  assert.equal((await webhook('checkout.session.completed', session)).status, 200)
  assert.ok((await owned(ALICE.uuid)).includes(PAID.id))
})

test('unpaid sessions grant nothing', async () => {
  const res = await call('POST', '/api/checkout', { username: 'Alice', capeIds: [PAID.id] })
  const session = sessions.get(String(res.body.id))! // still unpaid
  await webhook('checkout.session.completed', session)
  const status = await call('GET', `/api/checkout/status?session_id=${session.id}`)
  assert.equal(status.body.complete, false)
  assert.ok(!(await owned(ALICE.uuid)).includes(PAID.id))
})

test('return page confirms even if the webhook never arrives, and only once when both race', async () => {
  const session = await buy('Bob', [], true)
  const [a, b, c] = await Promise.all([
    call('GET', `/api/checkout/status?session_id=${session.id}`),
    webhook('checkout.session.completed', session),
    webhook('checkout.session.completed', session), // Stripe retries deliveries
  ])
  assert.equal(a.body.complete, true)
  assert.equal(b.status, 200)
  assert.equal(c.status, 200)
  const orders = [...storage.data.keys()].filter((k) => k.startsWith('order:'))
  assert.equal(orders.length, 1)
  assert.equal((await call('GET', '/api/collection-stock')).body.sold, 1)
  assert.equal((await owned(BOB.uuid)).length, CAPES.length)
})

test('checkout status rejects junk ids', async () => {
  assert.equal((await call('GET', '/api/checkout/status?session_id=../../admin')).status, 400)
})

test('full refund or chargeback takes the cloaks back; partial refund does not', async () => {
  const session = await buy('Alice', [PAID.id])
  await webhook('checkout.session.completed', session)
  await webhook('charge.refunded', { payment_intent: session.payment_intent, refunded: false })
  assert.ok((await owned(ALICE.uuid)).includes(PAID.id))
  await webhook('charge.dispute.created', { payment_intent: session.payment_intent })
  assert.ok(!(await owned(ALICE.uuid)).includes(PAID.id))
})

test('stripe signature helper round-trips and rejects tampering', async () => {
  const raw = '{"type":"x"}'
  const header = await signStripePayload(raw, WHSEC)
  assert.ok(await verifyStripeEvent(raw, header, WHSEC))
  assert.equal(await verifyStripeEvent('{"type":"y"}', header, WHSEC), null)
  assert.equal(await verifyStripeEvent(raw, header, ''), null)
})

test('concurrent grants to one player are never lost', async () => {
  const ids = paidCapes().slice(0, 8).map((cape) => cape.id)
  await Promise.all(ids.map((id) => store.grant(ALICE, [id], false)))
  const mine = await owned(ALICE.uuid)
  for (const id of ids) assert.ok(mine.includes(id), `${id} was lost`)
})

test('ownership follows the UUID, not the name (name change)', async () => {
  await store.grant(ALICE, [PAID.id], false)
  const newcomer = { username: 'Alice', uuid: 'cccccccc-cccc-cccc-cccc-cccccccccccc' }
  mojang.set('alice', newcomer)
  const theirs = await call('GET', `/api/cosmetics/owned?uuid=${newcomer.uuid}&username=Alice`)
  assert.ok(!(theirs.body.ownedCapeIds as string[]).includes(PAID.id))
  assert.ok((await owned(ALICE.uuid)).includes(PAID.id))
})

test('admin endpoints need a session; wrong password is rejected', async () => {
  assert.equal((await call('POST', '/api/admin/grant', { username: 'Bob', capeIds: [PAID.id] })).status, 401)
  assert.equal((await call('GET', '/api/admin/players')).status, 401)
  assert.equal((await call('POST', '/api/admin/login', { password: 'nope-nope' })).status, 401)
  const login = await call('POST', '/api/admin/login', { password: PASSWORD })
  const auth = { Authorization: `Bearer ${login.body.token}` }
  assert.equal((await call('POST', '/api/admin/grant', { username: 'Bob', capeIds: [PAID.id] }, auth)).status, 200)
  const players = await call('GET', '/api/admin/players', undefined, auth)
  assert.deepEqual((players.body.players as { username: string }[]).map((p) => p.username), ['Bob'])
  const revoked = await call('POST', '/api/admin/revoke', { username: 'Bob', capeIds: [PAID.id] }, auth)
  assert.ok(!(revoked.body.ownedCapeIds as string[]).includes(PAID.id))
  await call('POST', '/api/admin/logout', undefined, auth)
  assert.equal((await call('GET', '/api/admin/players', undefined, auth)).status, 401)
})

test('collection stock counts each paying player once, never admin grants', async () => {
  const first = await buy('Alice', [], true)
  await webhook('checkout.session.completed', first)
  assert.equal((await call('POST', '/api/checkout', { username: 'Alice', capeIds: [], collection: true })).status, 409)
  await store.adminGrant('Bob', [], true)
  assert.equal((await call('GET', '/api/collection-stock')).body.sold, 1)
})

test('legacy name-only records move to a UUID only when Mojang confirms it', async () => {
  const fresh = memoryStorage()
  await importLegacyStore(fresh, {
    byUuid: { [ALICE.uuid.replace(/-/g, '')]: { uuid: ALICE.uuid, username: 'Alice', ownedCapeIds: [PAID.id] } },
    byName: { bob: { uuid: '', username: 'Bob', ownedCapeIds: [paidCapes()[1].id] } },
    collectionSold: 3,
  })
  storage = fresh
  store = makeStore()
  assert.ok((await owned(ALICE.uuid)).includes(PAID.id))
  const thief = await call('GET', `/api/cosmetics/owned?uuid=${ALICE.uuid}&username=Bob`)
  assert.ok(!(thief.body.ownedCapeIds as string[]).includes(paidCapes()[1].id))
  const bob = await call('GET', `/api/cosmetics/owned?uuid=${BOB.uuid}&username=Bob`)
  assert.ok((bob.body.ownedCapeIds as string[]).includes(paidCapes()[1].id))
  assert.equal(fresh.data.has('legacy-name:bob'), false)
  assert.equal((await call('GET', '/api/collection-stock')).body.sold, 3)
})

test('direct grant endpoints stay closed', async () => {
  assert.equal((await call('POST', '/api/cosmetics/grant', { username: 'Bob', ownedCapeIds: [PAID.id] })).status, 403)
})

test('wings cost $6.99 at checkout and are granted on payment; refunds take them back', async () => {
  const res = await call('POST', '/api/checkout', { username: 'Alice', capeIds: [], wingIds: ['red'] })
  assert.equal(res.status, 200)
  assert.equal(lastForm!.get('line_items[0][price_data][unit_amount]'), '699')
  assert.equal(lastForm!.get('metadata[wings]'), 'red')
  const session = sessions.get(String(res.body.id))!
  session.payment_status = 'paid'
  await webhook('checkout.session.completed', session)
  const mine = await call('GET', `/api/cosmetics/owned?uuid=${ALICE.uuid}`)
  assert.deepEqual(mine.body.ownedWingIds, ['red'])
  assert.equal((await call('POST', '/api/checkout', { username: 'Alice', wingIds: ['red'] })).status, 409, 'already owned')
  await webhook('charge.dispute.created', { payment_intent: session.payment_intent })
  assert.deepEqual((await call('GET', `/api/cosmetics/owned?uuid=${ALICE.uuid}`)).body.ownedWingIds, [])
})

test('Obsidian wings can never be bought, even with a forged session', async () => {
  assert.equal((await call('POST', '/api/checkout', { username: 'Alice', wingIds: ['black'] })).status, 409)
  const res = await call('POST', '/api/checkout', { username: 'Bob', wingIds: ['blue'] })
  const session = sessions.get(String(res.body.id))!
  session.payment_status = 'paid'
  session.metadata = { ...session.metadata, wings: 'blue,black' } // tampered metadata
  await webhook('checkout.session.completed', session)
  assert.deepEqual((await call('GET', `/api/cosmetics/owned?uuid=${BOB.uuid}`)).body.ownedWingIds, ['blue'])
})

test('early access: needs the internal key, once per account, capped at the limit', async () => {
  const claim = (uuid: string, username: string, key = INTERNAL_KEY) =>
    call('POST', '/api/internal/early-access', { uuid, username }, { Authorization: `Bearer ${key}` })
  assert.equal((await call('POST', '/api/internal/early-access', { uuid: ALICE.uuid, username: 'Alice' })).status, 401)
  assert.equal((await claim(ALICE.uuid, 'Alice', 'x'.repeat(48))).status, 401)

  const first = await claim(ALICE.uuid, 'Alice')
  assert.equal(first.body.outcome, 'granted')
  assert.equal(first.body.number, 1)
  assert.ok(((await call('GET', `/api/cosmetics/owned?uuid=${ALICE.uuid}`)).body.ownedWingIds as string[]).includes('black'))
  const again = await claim(ALICE.uuid, 'Alice')
  assert.equal(again.body.outcome, 'already')
  assert.equal(again.body.number, 1, 'a repeat sign-in still knows its place in line')
  assert.equal((await call('GET', '/api/early-access')).body.claimed, 1)

  // Near the limit, simultaneous claims can never overshoot it.
  storage.data.set('meta:earlyAccessClaimed', 998)
  const uuids = Array.from({ length: 6 }, (_, i) => `${String(i + 1).repeat(8)}-0000-0000-0000-000000000000`)
  const results = await Promise.all(uuids.map((uuid, i) => claim(uuid, `Player${i}x`)))
  assert.equal(results.filter((r) => r.body.outcome === 'granted').length, 2)
  assert.equal(results.filter((r) => r.body.outcome === 'full').length, 4)
  const stock = await call('GET', '/api/early-access')
  assert.deepEqual([stock.body.claimed, stock.body.remaining], [1000, 0])
})

test('early access: claims from before numbering get numbers in claim order', async () => {
  const claim = (uuid: string, username: string) =>
    call('POST', '/api/internal/early-access', { uuid, username }, { Authorization: `Bearer ${INTERNAL_KEY}` })
  const late = '22222222000000000000000000000000'
  const early = '11111111000000000000000000000000'
  storage.data.set('index:players', [late, early])
  storage.data.set(`early:${late}`, 2_000)
  storage.data.set(`early:${early}`, 1_000)
  storage.data.set('meta:earlyAccessClaimed', 2)

  const lateAgain = await claim('22222222-0000-0000-0000-000000000000', 'Latecomer')
  assert.deepEqual([lateAgain.body.outcome, lateAgain.body.number], ['already', 2])
  const fresh = await claim(ALICE.uuid, 'Alice')
  assert.deepEqual([fresh.body.outcome, fresh.body.number], ['granted', 3])
  const earlyAgain = await claim('11111111-0000-0000-0000-000000000000', 'Earlybird')
  assert.deepEqual([earlyAgain.body.outcome, earlyAgain.body.number], ['already', 1])
})
