import { knownBadge, type BadgeId } from './badgeIds'

export { knownBadge, type BadgeId }

function icon(name: string) {
  return `${import.meta.env.BASE_URL}images/badges/${name}.png`
}

export const BADGES: { id: BadgeId; name: string; icon: string }[] = [
  { id: 'creator', name: 'Content creator', icon: icon('creator') },
  { id: 'owner', name: 'Owner', icon: icon('owner') },
  { id: 'booster', name: 'Discord booster', icon: icon('booster') },
  { id: 'admin', name: 'Admin', icon: icon('admin') },
]

export const DEFAULT_BADGE = { id: '' as const, name: 'Default', icon: icon('default') }

export function getBadge(id: unknown) {
  const known = knownBadge(id)
  return BADGES.find((badge) => badge.id === known) || DEFAULT_BADGE
}
