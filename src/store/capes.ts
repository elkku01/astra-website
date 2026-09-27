export type CapeCategory = 'all' | 'new' | 'popular' | 'animated'

export type Cape = {
  id: string
  name: string
  price: number
  blurb: string
  categories: Exclude<CapeCategory, 'all'>[]
  frames: number
  frameTimeMs: number
  createdAt: string
}

export const CLOAK_PRICE = 3.99
export const COLLECTION_LAUNCH_PRICE = 8.99
export const COLLECTION_LIMIT = 100

function cloak(label: string): string {
  return `${label} cloak`
}

const ADDED: Record<string, string> = {
  torii: '2026-09-20T19:58:05',
  gojo: '2026-09-26T14:22:48',
  ash: '2026-09-26T14:23:32',
  goated: '2026-09-26T14:45:27',
  shadow: '2026-09-26T14:46:38',
  spidey: '2026-09-26T14:48:39',
  swag: '2026-09-26T14:49:40',
  benjamin: '2026-09-26T14:50:37',
  void: '2026-09-26T14:53:03',
  monster: '2026-09-26T14:54:03',
  youdied: '2026-09-26T14:56:13',
  default: '2026-09-26T14:57:10',
  tuff: '2026-09-26T14:58:08',
  happens: '2026-09-26T14:59:05',
  cross: '2026-09-26T15:24:14',
  astraclient: '2026-09-26T15:09:15',
  ilove: '2026-09-26T15:32:20',
  ilove189: '2026-09-26T15:33:55',
  enderman: '2026-09-26T19:27:49',
  wither: '2026-09-26T19:29:09',
  creeper: '2026-09-26T19:30:05',
  steve: '2026-09-26T19:30:59',
  cat: '2026-09-26T20:31:35',
  blep: '2026-09-26T20:32:29',
  boom: '2026-09-26T20:33:26',
  hamster: '2026-09-26T20:34:17',
  glassstar: '2026-09-26T20:35:07',
  unoreverse: '2026-09-26T20:35:56',
  irl: '2026-09-26T20:36:52',
  aura: '2026-09-26T22:46:32',
  miku: '2026-09-27T09:15:49',
  muichiro: '2026-09-27T09:16:44',
  itadori: '2026-09-27T09:17:44',
}

const DRAFTS: Omit<Cape, 'createdAt'>[] = [
  { id: 'torii', name: cloak('Torii'), price: CLOAK_PRICE, blurb: 'A shrine gate on black silk.', categories: ['popular'], frames: 1, frameTimeMs: 1 },
  { id: 'gojo', name: cloak('Gojo'), price: CLOAK_PRICE, blurb: 'Blindfold, six eyes, night sky.', categories: ['popular'], frames: 1, frameTimeMs: 1 },
  { id: 'ash', name: cloak('Ash'), price: CLOAK_PRICE, blurb: 'Pale dust over charcoal.', categories: [], frames: 1, frameTimeMs: 1 },
  { id: 'goated', name: cloak('Goated'), price: CLOAK_PRICE, blurb: 'A small flex, stitched in.', categories: ['popular'], frames: 1, frameTimeMs: 1 },
  { id: 'shadow', name: cloak('Shadow'), price: CLOAK_PRICE, blurb: 'Almost nothing, then a silhouette.', categories: [], frames: 1, frameTimeMs: 1 },
  { id: 'spidey', name: cloak('Spidey'), price: CLOAK_PRICE, blurb: 'Webbing on a red fold.', categories: ['new'], frames: 1, frameTimeMs: 1 },
  { id: 'swag', name: cloak('Swag'), price: CLOAK_PRICE, blurb: 'Loud type on a dark drape.', categories: [], frames: 1, frameTimeMs: 1 },
  { id: 'benjamin', name: cloak('Dollar'), price: CLOAK_PRICE, blurb: 'A hundred-dollar drape.', categories: [], frames: 1, frameTimeMs: 1 },
  { id: 'void', name: cloak('Void'), price: CLOAK_PRICE, blurb: 'Deep space, thin cyan edge.', categories: ['popular'], frames: 1, frameTimeMs: 1 },
  { id: 'monster', name: cloak('Monster'), price: CLOAK_PRICE, blurb: 'A creature cut into the cloth.', categories: [], frames: 1, frameTimeMs: 1 },
  { id: 'cross', name: cloak('Cross'), price: CLOAK_PRICE, blurb: 'A shifting cross on black.', categories: ['animated', 'popular'], frames: 24, frameTimeMs: 50 },
  { id: 'youdied', name: cloak('You Died'), price: CLOAK_PRICE, blurb: 'The screen you never wanted.', categories: [], frames: 1, frameTimeMs: 1 },
  { id: 'default', name: cloak('Default'), price: CLOAK_PRICE, blurb: 'The clean Astra starter cloak.', categories: ['popular'], frames: 1, frameTimeMs: 1 },
  { id: 'tuff', name: cloak('Tuff'), price: CLOAK_PRICE, blurb: 'Stone-block grain.', categories: [], frames: 1, frameTimeMs: 1 },
  { id: 'happens', name: cloak('Happens'), price: CLOAK_PRICE, blurb: 'It happens. Wear it anyway.', categories: [], frames: 1, frameTimeMs: 1 },
  { id: 'astraclient', name: cloak('Eclipse'), price: 0, blurb: 'The client mark, looping in orbit.', categories: ['animated', 'popular'], frames: 12, frameTimeMs: 70 },
  { id: 'ilove', name: cloak('I Love Astra'), price: 0, blurb: 'A heart for the client.', categories: ['new'], frames: 1, frameTimeMs: 1 },
  { id: 'ilove189', name: cloak('I Love 1.8.9'), price: CLOAK_PRICE, blurb: 'For the old version, still.', categories: ['new'], frames: 1, frameTimeMs: 1 },
  { id: 'enderman', name: cloak('Enderman'), price: CLOAK_PRICE, blurb: 'Purple eyes in the dark.', categories: [], frames: 1, frameTimeMs: 1 },
  { id: 'wither', name: cloak('Wither'), price: CLOAK_PRICE, blurb: 'Three skulls, one cloak.', categories: [], frames: 1, frameTimeMs: 1 },
  { id: 'creeper', name: cloak('Creeper'), price: CLOAK_PRICE, blurb: 'The face everyone knows.', categories: [], frames: 1, frameTimeMs: 1 },
  { id: 'steve', name: cloak('Steve'), price: CLOAK_PRICE, blurb: 'Classic player, classic cloak.', categories: [], frames: 1, frameTimeMs: 1 },
  { id: 'cat', name: cloak('Cat'), price: CLOAK_PRICE, blurb: 'Whiskers on a dark fold.', categories: ['new'], frames: 1, frameTimeMs: 1 },
  { id: 'blep', name: cloak('Blep'), price: CLOAK_PRICE, blurb: 'Tongue out. No notes.', categories: ['new'], frames: 1, frameTimeMs: 1 },
  { id: 'boom', name: cloak('Boom'), price: CLOAK_PRICE, blurb: 'A small explosion, wearable.', categories: [], frames: 1, frameTimeMs: 1 },
  { id: 'hamster', name: cloak('Hamster'), price: CLOAK_PRICE, blurb: 'Tiny, round, committed.', categories: ['new'], frames: 1, frameTimeMs: 1 },
  { id: 'glassstar', name: cloak('Glass Star'), price: CLOAK_PRICE, blurb: 'A star caught in glass.', categories: ['new'], frames: 1, frameTimeMs: 1 },
  { id: 'unoreverse', name: cloak('Uno Reverse'), price: CLOAK_PRICE, blurb: 'No, you.', categories: [], frames: 1, frameTimeMs: 1 },
  { id: 'irl', name: cloak('IRL'), price: CLOAK_PRICE, blurb: 'For when the server is life.', categories: [], frames: 1, frameTimeMs: 1 },
  { id: 'aura', name: cloak('Aura'), price: CLOAK_PRICE, blurb: 'A slow animated glow.', categories: ['animated', 'new', 'popular'], frames: 24, frameTimeMs: 168 },
  { id: 'miku', name: cloak('Miku'), price: CLOAK_PRICE, blurb: 'Teal twin-tails on black.', categories: ['new'], frames: 1, frameTimeMs: 1 },
  { id: 'muichiro', name: cloak('Muichiro'), price: CLOAK_PRICE, blurb: 'Mist-hashira teal.', categories: ['new'], frames: 1, frameTimeMs: 1 },
  { id: 'itadori', name: cloak('Itadori'), price: CLOAK_PRICE, blurb: 'Pink hair, hard lines.', categories: ['new'], frames: 1, frameTimeMs: 1 },
]

export const CAPES: Cape[] = DRAFTS.map((cape) => {
  const createdAt = ADDED[cape.id]
  if (!createdAt) throw new Error(`Missing catalog date for ${cape.id}`)
  return { ...cape, createdAt }
})

export function getCape(id: string): Cape | undefined {
  return CAPES.find((cape) => cape.id === id)
}

export function isFreeCape(cape: Cape): boolean {
  return cape.price <= 0
}

export function paidCapes(): Cape[] {
  return CAPES.filter((cape) => cape.price > 0)
}

export function freeCapeIds(): string[] {
  return CAPES.filter(isFreeCape).map((cape) => cape.id)
}

export const COLLECTION_REGULAR_PRICE = CLOAK_PRICE * paidCapes().length

export function formatPrice(value: number): string {
  if (value <= 0) return 'Free'
  return `$${value.toFixed(2)}`
}

export function isAnimatedCape(cape: Cape): boolean {
  return cape.frames > 1 || cape.categories.includes('animated')
}

export function formatAddedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}
