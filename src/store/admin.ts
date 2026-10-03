import { readAdminToken, storeApiUrl, writeAdminToken } from './storeApi'

const FLAG_KEY = 'astra-admin-ok'

export type AdminPlayer = {
  uuid: string
  username: string
  ownedCapeIds: string[]
  collection: boolean
  /** Nametag icon role ('' = default white). */
  badge?: string
}

function setAuthedFlag(value: boolean) {
  try {
    if (value) sessionStorage.setItem(FLAG_KEY, '1')
    else sessionStorage.removeItem(FLAG_KEY)
  } catch {
    // Private mode can block sessionStorage.
  }
  if (!value) writeAdminToken(null)
}

export function isAdminAuthed(): boolean {
  try {
    return sessionStorage.getItem(FLAG_KEY) === '1' && Boolean(readAdminToken())
  } catch {
    return false
  }
}

async function adminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = readAdminToken()
  const response = await fetch(storeApiUrl(path), {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: string; token?: string })
    | { error?: string; token?: string }
    | null
  if (!response.ok) {
    if (response.status === 401) setAuthedFlag(false)
    throw new Error(
      (body && typeof body === 'object' && body.error) ||
        (response.status === 404 || response.status === 405
          ? 'Admin needs the live store API. Refresh after the latest deploy.'
          : `Admin request failed (${response.status})`),
    )
  }
  return body as T
}

export async function adminLogin(password: string): Promise<void> {
  const body = await adminJson<{ ok?: boolean; token?: string }>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
  if (!body.token) throw new Error('Admin login did not return a session.')
  writeAdminToken(body.token)
  setAuthedFlag(true)
}

export async function adminLogout(): Promise<void> {
  try {
    await adminJson('/api/admin/logout', { method: 'POST' })
  } catch {
    // Clear local auth even if the server session is already gone.
  }
  setAuthedFlag(false)
}

export async function fetchAdminPlayers(): Promise<AdminPlayer[]> {
  const body = await adminJson<{ players: AdminPlayer[] }>('/api/admin/players')
  return Array.isArray(body.players) ? body.players : []
}

export async function adminGrant(username: string, capeIds: string[], collection = false) {
  return adminJson<AdminPlayer>('/api/admin/grant', {
    method: 'POST',
    body: JSON.stringify({ username, capeIds, collection }),
  })
}

export async function adminRevoke(username: string, capeIds: string[], ownedCapeIds?: string[]) {
  return adminJson<AdminPlayer>('/api/admin/revoke', {
    method: 'POST',
    body: JSON.stringify({ username, capeIds, ownedCapeIds }),
  })
}

/** Gives a player a nametag icon role, or '' for the default white icon. */
export async function adminSetBadge(username: string, badge: string) {
  return adminJson<AdminPlayer>('/api/admin/badge', {
    method: 'POST',
    body: JSON.stringify({ username, badge }),
  })
}
