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
  { id: 'red', name: 'Crimson Nebula Wings', blurb: 'Deep red nebula with glowing veins.', price: WING_PRICE, purchasable: true },
  { id: 'purple', name: 'Void Nebula Wings', blurb: 'Violet gas and starlight.', price: WING_PRICE, purchasable: true },
  { id: 'blue', name: 'Frost Nebula Wings', blurb: 'Ice-blue nebula, bright veins.', price: WING_PRICE, purchasable: true },
  { id: 'gold', name: 'Solar Nebula Wings', blurb: 'Molten gold and amber.', price: WING_PRICE, purchasable: true },
  { id: 'green', name: 'Venom Nebula Wings', blurb: 'Toxic green glow.', price: WING_PRICE, purchasable: true },
  { id: 'white', name: 'Pearl Nebula Wings', blurb: 'Silver-white nebula.', price: WING_PRICE, purchasable: true },
  { id: EARLY_ACCESS_WING, name: 'Obsidian Wings', blurb: 'Early-access reward for the first 1000 Astra players.', price: 0, purchasable: false },
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
