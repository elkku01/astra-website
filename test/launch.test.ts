import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { LAUNCH_AT, handleLaunch, resetInstallerCache } from '../server/launch.ts'

const ORIGINS = ['https://astraclient.eu']
const ASSET = 'https://github.com/elkku01/astra-client-updates/releases/download/v0.3.35/AstraClient-Setup-0.3.35.exe'

function github(assets: { name: string; browser_download_url: string }[]) {
  return (async () => Response.json({ assets })) as unknown as typeof fetch
}

beforeEach(() => resetInstallerCache())

test('launch is 24 October 2026 at 15:00 Finland time', () => {
  assert.equal(new Date(LAUNCH_AT).toISOString(), '2026-10-24T12:00:00.000Z')
})

test('before launch the download is refused, whatever the visitor sends', async () => {
  for (const now of [Date.UTC(2026, 9, 18), LAUNCH_AT - 1]) {
    const res = await handleLaunch(new Request('https://api.test/api/download?force=1', { headers: { Date: 'Sat, 24 Oct 2099 00:00:00 GMT' } }), ORIGINS, now, github([{ name: 'AstraClient-Setup-0.3.35.exe', browser_download_url: ASSET }]))
    assert.equal(res!.status, 403)
    assert.equal(res!.headers.get('Location'), null)
  }
})

test('from the launch second the download redirects to the newest installer', async () => {
  const res = await handleLaunch(new Request('https://api.test/api/download'), ORIGINS, LAUNCH_AT, github([
    { name: 'AstraClient-Update-1.0.0.exe', browser_download_url: ASSET.replace('Setup', 'Update') },
    { name: 'AstraClient-Setup-0.3.35.exe', browser_download_url: ASSET },
  ]))
  assert.equal(res!.status, 302)
  assert.equal(res!.headers.get('Location'), ASSET)
})

test('a download link that is not on the release repo is never used', async () => {
  const res = await handleLaunch(new Request('https://api.test/api/download'), ORIGINS, LAUNCH_AT + 1, github([
    { name: 'AstraClient-Setup-0.3.35.exe', browser_download_url: 'https://evil.example/AstraClient-Setup-0.3.35.exe' },
  ]))
  assert.equal(res!.headers.get('Location'), 'https://github.com/elkku01/astra-client-updates/releases/latest')
})

test('launch status uses the server clock and only allows the site', async () => {
  const now = LAUNCH_AT - 5000
  const res = await handleLaunch(new Request('https://api.test/api/launch', { headers: { Origin: 'https://astraclient.eu' } }), ORIGINS, now)
  assert.deepEqual(await res!.json(), { launchAt: LAUNCH_AT, now, open: false })
  assert.equal(res!.headers.get('Access-Control-Allow-Origin'), 'https://astraclient.eu')
  const other = await handleLaunch(new Request('https://api.test/api/launch', { headers: { Origin: 'https://evil.example' } }), ORIGINS, now)
  assert.equal(other!.headers.get('Access-Control-Allow-Origin'), null)
})

test('other store requests are not touched', async () => {
  assert.equal(await handleLaunch(new Request('https://api.test/api/cosmetics'), ORIGINS), null)
})
