/**
 * Nametag icon roles. Everyone on Astra has the white icon; these coloured ones
 * are given by an admin on the website and are never sold. Shared by the store
 * server and the website (no images here, so the Worker can import it).
 */
export type BadgeId = 'creator' | 'owner' | 'booster' | 'admin'

export const BADGE_IDS: BadgeId[] = ['creator', 'owner', 'booster', 'admin']

/** A known badge id, or '' for the default white icon. */
export function knownBadge(id: unknown): BadgeId | '' {
  const value = String(id || '').trim().toLowerCase()
  return (BADGE_IDS as string[]).includes(value) ? (value as BadgeId) : ''
}
