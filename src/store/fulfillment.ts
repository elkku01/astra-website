import { CAPES, paidCapes } from './capes'

export type BasketPackage = {
  slug?: string | null
  name?: string | null
}

export function packageKey(value = ''): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function capeKeys(id: string, name = ''): string[] {
  const baseName = name.replace(/\s*cloak\s*$/i, '')
  const keys = [id, name, baseName, `${id}cloak`, `${baseName}cloak`].map(packageKey)
  return [...new Set(keys.filter(Boolean))]
}

export function isCollectionPackage(
  packages: BasketPackage[],
  collectionSlug = 'collection',
): boolean {
  const wanted = packageKey(collectionSlug || 'collection')
  const extras = new Set([wanted, `${wanted}cloak`, 'unlockentirecollection'])
  return packages.some((item) => {
    const keys = [item.slug || '', item.name || ''].map(packageKey)
    return keys.some((key) => extras.has(key))
  })
}

export function capeIdsFromPackages(
  packages: BasketPackage[],
  collectionSlug = 'collection',
): string[] {
  if (!Array.isArray(packages) || packages.length === 0) return []
  if (isCollectionPackage(packages, collectionSlug)) {
    return CAPES.map((cape) => cape.id)
  }
  const keys = new Set(
    packages.flatMap((item) => [item.slug || '', item.name || ''].map(packageKey)).filter(Boolean),
  )
  return CAPES.filter((cape) => capeKeys(cape.id, cape.name).some((key) => keys.has(key))).map(
    (cape) => cape.id,
  )
}

export function knownCapeIds(ids: string[]): string[] {
  const catalog = new Set(CAPES.map((cape) => cape.id))
  return [...new Set(ids.filter((id) => catalog.has(id)))]
}

export function isFullCollection(ids: string[]): boolean {
  const owned = new Set(ids)
  return paidCapes().every((cape) => owned.has(cape.id))
}
