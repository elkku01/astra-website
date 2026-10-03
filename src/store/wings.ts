/**
 * Astra wings. Ids must match the game (AstraWings.java) and the presence API.
 * Paid wings are sold in the store; Obsidian is never sold: it is granted to
 * the first EARLY_ACCESS_LIMIT players who sign in to the Astra launcher.
 */
export const WING_PRICE = 6.99
export const EARLY_ACCESS_WING = 'black'
export const EARLY_ACCESS_LIMIT = 1000

export type Wing = {
  id: string
  name: string
  blurb: string
  price: number
  /** False for rewards that can never be bought. */
  purchasable: boolean
}

export const WINGS: Wing[] = [
  { id: 'red', name: 'Crimson Nebula Wings', blurb: 'Bat-style wings with a deep red nebula and glowing veins.', price: WING_PRICE, purchasable: true },
  { id: 'purple', name: 'Void Nebula Wings', blurb: 'Bat-style wings with a violet nebula and scattered stars.', price: WING_PRICE, purchasable: true },
  { id: 'blue', name: 'Frost Nebula Wings', blurb: 'Bat-style wings with an icy blue nebula and bright veins.', price: WING_PRICE, purchasable: true },
  { id: 'gold', name: 'Solar Nebula Wings', blurb: 'Bat-style wings with a molten gold and amber nebula.', price: WING_PRICE, purchasable: true },
  { id: 'green', name: 'Venom Nebula Wings', blurb: 'Bat-style wings with a toxic green nebula glow.', price: WING_PRICE, purchasable: true },
  { id: 'white', name: 'Pearl Nebula Wings', blurb: 'Bat-style wings in silver and pearl grey.', price: WING_PRICE, purchasable: true },
  { id: EARLY_ACCESS_WING, name: 'Obsidian Wings', blurb: 'Black obsidian wings, the reward for the first 1000 Astra players.', price: 0, purchasable: false },
]

export function getWing(id: string): Wing | undefined {
  return WINGS.find((wing) => wing.id === id)
}

export function knownWingIds(ids: string[]): string[] {
  const catalog = new Set(WINGS.map((wing) => wing.id))
  return [...new Set(ids.filter((id) => catalog.has(id)))]
}

export function purchasableWings(): Wing[] {
  return WINGS.filter((wing) => wing.purchasable)
}
