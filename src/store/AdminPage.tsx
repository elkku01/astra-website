import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  adminGrant,
  adminLogout,
  adminRevoke,
  fetchAdminPlayers,
  isAdminAuthed,
  type AdminPlayer,
} from './admin'
import { avatarUrl } from './api'
import { INVALID_MINECRAFT_ACCOUNT, resolveMinecraftAccount } from './minecraftAccount'
import { capeThumbUrl } from './capeArt'
import { CAPES, getCape, paidCapes } from './capes'
import { useSession } from './session'

function ownedIds(player: AdminPlayer): string[] {
  if (player.collection) return CAPES.map((cape) => cape.id)
  return player.ownedCapeIds
}

export default function AdminPage() {
  const { refreshUser } = useSession()
  const [players, setPlayers] = useState<AdminPlayer[]>([])
  const [query, setQuery] = useState('')
  const [activeName, setActiveName] = useState('')
  const [giveId, setGiveId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [authed, setAuthed] = useState(isAdminAuthed())

  async function loadPlayers() {
    const list = await fetchAdminPlayers()
    setPlayers(list)
  }

  useEffect(() => {
    if (!authed) return
    void loadPlayers().catch((err) => {
      setError(err instanceof Error ? err.message : 'Could not load players')
      setAuthed(false)
    })
  }, [authed])

  const paidIds = useMemo(() => paidCapes().map((cape) => cape.id), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return players
    return players.filter((player) => player.username.toLowerCase().includes(q))
  }, [players, query])

  const typedName = query.trim()
  const typedIsNew =
    typedName.length >= 3 &&
    !players.some((player) => player.username.toLowerCase() === typedName.toLowerCase())

  const activeFromList = players.find(
    (player) => player.username.toLowerCase() === activeName.toLowerCase(),
  )
  const active =
    activeFromList ||
    (activeName.length >= 3
      ? {
          uuid: '',
          username: activeName,
          ownedCapeIds: [] as string[],
          collection: false,
        }
      : null)

  const owned = active ? ownedIds(active) : []
  const missing = CAPES.filter((cape) => !owned.includes(cape.id))

  if (!authed) return <Navigate to="/store" replace />

  function selectPlayer(name: string) {
    void activatePlayer(name)
  }

  async function activatePlayer(name: string) {
    setGiveId('')
    setNotice('')
    const known = players.some((player) => player.username.toLowerCase() === name.toLowerCase())
    if (known) {
      setError('')
      setActiveName(name)
      return
    }
    setBusy('lookup')
    setError('')
    try {
      const account = await resolveMinecraftAccount(name)
      setActiveName(account.username)
    } catch (err) {
      setActiveName('')
      setError(err instanceof Error ? err.message : INVALID_MINECRAFT_ACCOUNT)
    } finally {
      setBusy(null)
    }
  }

  async function give(ids: string[]) {
    if (!active || ids.length === 0) return
    setBusy('give')
    setError('')
    setNotice('')
    try {
      const account = await resolveMinecraftAccount(active.username)
      const collection = paidIds.every((id) => [...owned, ...ids].includes(id))
      const record = await adminGrant(account.username, ids, collection)
      setNotice(`Gave ${ids.length === 1 ? getCape(ids[0])?.name || ids[0] : `${ids.length} cloaks`} to ${record.username}.`)
      setGiveId('')
      await loadPlayers()
      await refreshUser(record.username)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not give cloak')
    } finally {
      setBusy(null)
    }
  }

  async function remove(id: string) {
    if (!active) return
    setBusy(id)
    setError('')
    setNotice('')
    try {
      const record = await adminRevoke(active.username, [id], owned)
      setNotice(`Removed ${getCape(id)?.name || id} from ${record.username}.`)
      await loadPlayers()
      await refreshUser(record.username)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove cloak')
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="store-main admin-page">
      <div className="admin-head">
        <div>
          <p className="kicker">Admin</p>
          <h1 className="page-title">Players</h1>
        </div>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            void adminLogout()
            setAuthed(false)
          }}
        >
          Log out
        </button>
      </div>
      <p className="admin-lead">Pick a player, then give a cloak or remove one they already own.</p>

      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="owned-line">{notice}</p> : null}

      <div className="admin-shell">
        <aside className="admin-list-pane">
          <label className="admin-search">
            Find or add player
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                if (typedName.length < 3) return
                const exact = players.find(
                  (player) => player.username.toLowerCase() === typedName.toLowerCase(),
                )
                selectPlayer(exact?.username || filtered[0]?.username || typedName)
              }}
              placeholder="Minecraft username"
              autoComplete="off"
              spellCheck={false}
              maxLength={16}
            />
          </label>
          {typedIsNew ? (
            <button
              type="button"
              className={`admin-player ${activeName.toLowerCase() === typedName.toLowerCase() ? 'on' : ''}`}
              onClick={() => selectPlayer(typedName)}
            >
              <span>
                <strong>{typedName}</strong>
                <em>New player</em>
              </span>
            </button>
          ) : null}
          {filtered.length === 0 && !typedIsNew ? (
            <p className="empty">No players match that name.</p>
          ) : (
            <ul className="admin-players">
              {filtered.map((player) => (
                <li key={player.username || player.uuid}>
                  <button
                    type="button"
                    className={`admin-player ${activeName.toLowerCase() === player.username.toLowerCase() ? 'on' : ''}`}
                    onClick={() => selectPlayer(player.username)}
                  >
                    <img src={avatarUrl(player.username, 48, player.uuid)} alt="" width={36} height={36} />
                    <span>
                      <strong>{player.username || player.uuid}</strong>
                      <em>
                        {player.collection ? 'Full collection' : `${ownedIds(player).length} cloaks`}
                      </em>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="admin-detail" aria-live="polite">
          {!active ? (
            <p className="empty">Select a player on the left to manage their cloaks.</p>
          ) : (
            <>
              <header className="admin-detail-head">
                {active.uuid || players.some((p) => p.username === active.username) ? (
                  <img src={avatarUrl(active.username, 64, active.uuid)} alt="" width={44} height={44} />
                ) : null}
                <div>
                  <h2>{active.username}</h2>
                  <p>
                    {active.collection
                      ? 'Owns the full collection'
                      : `${owned.length} cloak${owned.length === 1 ? '' : 's'}`}
                  </p>
                </div>
              </header>

              <div className="admin-give-row">
                <label>
                  Give a cloak
                  <select
                    value={giveId}
                    onChange={(event) => setGiveId(event.target.value)}
                    disabled={missing.length === 0 || busy !== null}
                  >
                    <option value="">
                      {missing.length === 0 ? 'They already own every cloak' : 'Choose a cloak'}
                    </option>
                    {missing.map((cape) => (
                      <option key={cape.id} value={cape.id}>
                        {cape.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!giveId || busy !== null}
                  onClick={() => void give([giveId])}
                >
                  {busy === 'give' ? 'Giving…' : 'Give'}
                </button>
                {missing.some((cape) => paidIds.includes(cape.id)) ? (
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy !== null}
                    onClick={() => void give(missing.map((cape) => cape.id))}
                  >
                    Give all remaining
                  </button>
                ) : null}
              </div>

              <h3>Owned</h3>
              {owned.length === 0 ? (
                <p className="empty">No cloaks yet.</p>
              ) : (
                <ul className="admin-owned">
                  {owned.map((id) => {
                    const cape = getCape(id)
                    return (
                      <li key={id}>
                        {cape ? <img src={capeThumbUrl(cape)} alt="" width={28} height={36} /> : null}
                        <span>{cape?.name || id}</span>
                        <button
                          type="button"
                          className="admin-remove"
                          disabled={busy !== null}
                          onClick={() => void remove(id)}
                        >
                          {busy === id ? 'Removing…' : 'Remove'}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </section>
      </div>

      <Link className="text-link" to="/store" viewTransition>
        ← Back to cloaks
      </Link>
    </main>
  )
}
