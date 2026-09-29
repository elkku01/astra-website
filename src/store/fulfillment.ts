import { CAPES, paidCapes } from './capes'

export function knownCapeIds(ids: string[]): string[] {
  const catalog = new Set(CAPES.map((cape) => cape.id))
  return [...new Set(ids.filter((id) => catalog.has(id)))]
}

export function isFullCollection(ids: string[]): boolean {
  const owned = new Set(ids)
  return paidCapes().every((cape) => owned.has(cape.id))
}
