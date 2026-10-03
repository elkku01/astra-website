import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  adminGrant,
  adminGrantWings,
  adminLogout,
  adminRevoke,
  adminRevokeWings,
  adminSetBadge,
  fetchAdminPlayers,
  isAdminAuthed,
  type AdminPlayer,
} from './admin'
import { avatarUrl } from './api'
import { BADGES, DEFAULT_BADGE, getBadge } from './badges'
import { INVALID_MINECRAFT_ACCOUNT, resolveMinecraftAccount } from './minecraftAccount'
import { capeThumbUrl } from './capeArt'
import { CAPES, getCape, paidCapes } from './capes'
import { useSession } from './session'
import { WINGS, getWing } from './wings'
import { wingImage } from './WingsSection'

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
  const [giveWingId, setGiveWingId] = useState('')
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
  const ownedWings = active?.ownedWingIds || []
  const missingWings = WINGS.filter((wing) => !ownedWings.includes(wing.id))

  if (!authed) return <Navigate to="/store" replace />

  function selectPlayer(name: string) {
    void activatePlayer(name)
  }

  async function activatePlayer(name: string) {
    setGiveId('')
    setGiveWingId('')
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

  async function giveWings(ids: string[]) {
    if (!active || ids.length === 0) return
    setBusy('give-wings')
    setError('')
    setNotice('')
    try {
      const account = await resolveMinecraftAccount(active.username)
      const record = await adminGrantWings(account.username, ids)
      setNotice(`Gave ${ids.length === 1 ? getWing(ids[0])?.name || ids[0] : `${ids.length} wings`} to ${record.username}.`)
      setGiveWingId('')
      await loadPlayers()
      await refreshUser(record.username)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not give wings')
    } finally {
      setBusy(null)
    }
  }

  async function removeWings(id: string) {
    if (!active) return
    setBusy(`wing:${id}`)
    setError('')
    setNotice('')
    try {
      const record = await adminRevokeWings(active.username, [id])
      setNotice(`Removed ${getWing(id)?.name || id} from ${record.username}.`)
      await loadPlayers()
      await refreshUser(record.username)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove wings')
    } finally {
      setBusy(null)
    }
  }

  async function setBadge(badge: string) {
    if (!active) return
    setBusy(`badge:${badge}`)
    setError('')
    setNotice('')
    try {
      const account = await resolveMinecraftAccount(active.username)
      const record = await adminSetBadge(account.username, badge)
      setNotice(
        badge
          ? `${record.username} now has the ${getBadge(badge).name} icon. It shows in game within a few minutes.`
          : `${record.username} is back to the default icon.`,
      )
      await loadPlayers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the icon')
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
                      <strong>
                        {player.badge ? (
                          <img
                            className="admin-badge-mini"
                            src={getBadge(player.badge).icon}
                            alt=""
                            title={getBadge(player.badge).name}
                            width={14}
                            height={14}
                          />
                        ) : null}
                        {player.username || player.uuid}
                      </strong>
                      <em>
                        {player.collection ? 'Full collection' : `${ownedIds(player).length} cloaks`}
                        {player.ownedWingIds?.length ? ` · ${player.ownedWingIds.length} wings` : ''}
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

              <h3>Nametag icon</h3>
              <p className="admin-badge-note">
                Shown next to their name in game. Everyone has the white one; the others can only be given here.
              </p>
              <div className="admin-badges" role="radiogroup" aria-label="Nametag icon">
                {[DEFAULT_BADGE, ...BADGES].map((badge) => {
                  const on = (active.badge || '') === badge.id
                  return (
                    <button
                      key={badge.id || 'default'}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={`admin-badge ${on ? 'on' : ''}`}
                      disabled={busy !== null || on}
                      onClick={() => void setBadge(badge.id)}
                    >
                      <span className="admin-badge-icon">
                        <img src={badge.icon} alt="" width={28} height={28} />
                      </span>
                      <span>{busy === `badge:${badge.id}` ? 'Saving…' : badge.name}</span>
                    </button>
                  )
                })}
              </div>

              <h3>Cloaks</h3>
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

              <h3>Wings</h3>
              <div className="admin-give-row">
                <label>
                  Give wings
                  <select
                    value={giveWingId}
                    onChange={(event) => setGiveWingId(event.target.value)}
                    disabled={missingWings.length === 0 || busy !== null}
                  >
                    <option value="">
                      {missingWings.length === 0 ? 'They already own every wing' : 'Choose wings'}
                    </option>
                    {missingWings.map((wing) => (
                      <option key={wing.id} value={wing.id}>
                        {wing.name}
                        {wing.purchasable ? '' : ' (reward)'}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!giveWingId || busy !== null}
                  onClick={() => void giveWings([giveWingId])}
                >
                  {busy === 'give-wings' ? 'Giving…' : 'Give'}
                </button>
                {missingWings.length > 1 ? (
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy !== null}
                    onClick={() => void giveWings(missingWings.map((wing) => wing.id))}
                  >
                    Give all wings
                  </button>
                ) : null}
              </div>
              {ownedWings.length === 0 ? (
                <p className="empty">No wings yet.</p>
              ) : (
                <ul className="admin-owned">
                  {ownedWings.map((id) => (
                    <li key={id}>
                      <img className="admin-wing-thumb" src={wingImage(id)} alt="" width={28} height={20} />
                      <span>{getWing(id)?.name || id}</span>
                      <button
                        type="button"
                        className="admin-remove"
                        disabled={busy !== null}
                        onClick={() => void removeWings(id)}
                      >
                        {busy === `wing:${id}` ? 'Removing…' : 'Remove'}
                      </button>
                    </li>
                  ))}
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
