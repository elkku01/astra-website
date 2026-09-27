const DEFAULT_PROD_API = 'https://astra-store.elmeri-liikonen-noobthepro.workers.dev/api'
const API = String(import.meta.env.VITE_STORE_API || (import.meta.env.DEV ? '' : DEFAULT_PROD_API)).replace(/\/$/, '')
const TOKEN_KEY = 'astra-admin-token'

export function storeApiUrl(path: string) {
  const rel = path.replace(/^\/api(?=\/|$)/, '') || '/'
  const suffix = rel.startsWith('/') ? rel : `/${rel}`
  return API ? `${API}${suffix}` : `/api${suffix}`
}

export function readAdminToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function writeAdminToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Private mode can block sessionStorage.
  }
}
