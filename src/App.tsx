import { useState } from 'react'
import {
  DOWNLOAD_LABEL,
  DOWNLOAD_META,
  startLauncherDownload,
} from './download'
import './App.css'

function asset(path: string) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
}

const NAV = [
  { href: '#features', label: 'Features' },
  { href: '#mods', label: 'Mods' },
  { href: '#speed', label: 'Speed' },
  { href: '#look', label: 'Look' },
  { href: '#faq', label: 'FAQ' },
]

const SHOTS = [
  {
    src: asset('/images/screenshots/launcher-home.png'),
    alt: 'Astra launcher home with Launch',
  },
  {
    src: asset('/images/screenshots/launcher-mods.png'),
    alt: 'Astra Mods page with Modrinth search',
  },
  {
    src: asset('/images/screenshots/game-title.jpg'),
    alt: 'Custom Astra Minecraft title screen',
  },
  {
    src: asset('/images/screenshots/client-home.png'),
    alt: 'In-game Astra Options hub',
  },
  {
    src: asset('/images/screenshots/client-sprint.png'),
    alt: 'Toggle Sprint module options',
  },
]

const STATS = [
  { value: '18+', label: 'Built-in modules' },
  { value: '2–3s', label: 'to the title screen' },
  { value: '2', label: 'Minecraft versions' },
  { value: '1', label: 'Download, client included' },
]

const FEATURES = [
  {
    icon: '⚡',
    title: 'Lightspeed launch',
    body: 'Press Launch and you are in the world in about 2–3 seconds. No long vanilla splash, no waiting on a heavy client.',
  },
  {
    icon: '▣',
    title: 'Custom HUD',
    body: 'FPS, CPS, ping, armor, potions, day, pack display — drag them anywhere from Edit HUD Layout.',
  },
  {
    icon: '✦',
    title: 'Astra Options',
    body: 'Esc opens a full in-game hub. Toggle modules, set keybinds, and style every HUD piece.',
  },
  {
    icon: '⌘',
    title: 'Mod Browser',
    body: 'Search Modrinth and install extras in one click, or drop a .jar onto the Mods page.',
  },
  {
    icon: '◎',
    title: 'Two eras',
    body: 'Fabric 1.21.5 and Forge 1.8.9 in one launcher. Loaders, API, and Astra Client are handled for you.',
  },
  {
    icon: '+',
    title: 'One download',
    body: 'The installer is the launcher. Astra Client syncs on Launch — no separate jar hunt.',
  },
]

const BUNDLED = [
  { name: 'Astra Client', tag: 'Included', tone: 'in' },
  { name: 'Sodium stack', tag: '1.21.5', tone: 'in' },
  { name: 'OptiFine HD U M5', tag: '1.8.9', tone: 'in' },
  { name: 'Fabric API', tag: 'Required', tone: 'req' },
  { name: 'Modrinth extras', tag: '+ Add', tone: 'add' },
]

const LAUNCH_ROWS = [
  { name: 'Official launcher', time: '18s', width: '100%' },
  { name: 'Lunar Client', time: '12s', width: '67%' },
  { name: 'Dawn', time: '11s', width: '61%' },
  { name: 'Astra', time: '2–3s', width: '16%', accent: true },
]

const FAQ = [
  {
    q: 'What is Astra Client?',
    a: 'A lightweight in-game client built into Astra. HUD modules, extra options, and quality-of-life features — it runs inside Minecraft, not in the launcher.',
  },
  {
    q: 'Do I download the client separately?',
    a: 'No. Download the launcher and you get Astra Client with it. On Launch, the matching jar is synced into the mods folder.',
  },
  {
    q: 'Which versions are supported?',
    a: '1.21.5 on Fabric and 1.8.9 on Forge. Those two, fully set up.',
  },
  {
    q: 'Is this a cheat client?',
    a: 'No. Astra is HUD and utility: sprint, zoom, chat tools, hitbox overlays, 1.7 visuals, and movable stats. There is no combat cheating.',
  },
  {
    q: 'How do I open it in game?',
    a: 'Press Esc, then open Astra Options. Use Options for keybinds and Edit HUD Layout to move pieces.',
  },
  {
    q: 'What do I need to play?',
    a: 'A Microsoft account for Minecraft Java Edition, and Windows. Astra downloads the right Java for 1.21.5 or 1.8.9 automatically the first time you press Launch.',
  },
]

function handleDownload() {
  void startLauncherDownload()
}

function WindowsIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M1 2.2 7.1 1.4v6.2H1V2.2Zm7.2-.9L15 0v7.6H8.2V1.3ZM1 8.8h6.1V14.6L1 13.8V8.8Zm7.2 0H15V16l-6.8-1V8.8Z"
      />
    </svg>
  )
}

function App() {
  const [shot, setShot] = useState(0)
  const current = SHOTS[shot]

  return (
    <div className="page">
      <header className="nav">
        <a className="brand" href="#top">
          <img src={asset('/images/astra-mark.png')} alt="" width={28} height={28} />
          ASTRA
        </a>
        <nav className="nav-links" aria-label="Primary">
          {NAV.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <button type="button" className="nav-cta" onClick={handleDownload}>
          Download
        </button>
      </header>

      <main>
        <section className="hero" id="top">
          <div className="hero-glow" aria-hidden="true" />
          <h1>
            <span className="hero-word">ASTRA</span>
            <span className="hero-sub">Minecraft Client</span>
          </h1>
          <p className="hero-lead">
            A modern Minecraft client built around speed, customization, and
            simplicity. Title screen in about 2–3 seconds.
          </p>
          <div className="hero-actions">
            <button type="button" className="btn-primary" onClick={handleDownload}>
              <WindowsIcon />
              {DOWNLOAD_LABEL}
            </button>
            <a className="btn-ghost" href="#features">
              Explore Features
            </a>
          </div>
          <p className="hero-meta">
            Supports 1.21.5 Fabric &amp; 1.8.9 Forge · Launcher + client
          </p>
        </section>

        <section className="carousel wrap" aria-label="Product screenshots">
          <div className="carousel-frame">
            <img src={current.src} alt={current.alt} />
            <button
              type="button"
              className="carousel-next"
              aria-label="Next image"
              onClick={() => setShot((i) => (i + 1) % SHOTS.length)}
            >
              ›
            </button>
          </div>
          <div className="dots" role="tablist" aria-label="Screenshots">
            {SHOTS.map((item, i) => (
              <button
                key={item.src}
                type="button"
                role="tab"
                aria-label={`Show screenshot ${i + 1}`}
                aria-selected={i === shot}
                className={i === shot ? 'dot on' : 'dot'}
                onClick={() => setShot(i)}
              />
            ))}
          </div>
        </section>

        <section className="stats wrap">
          {STATS.map((item) => (
            <div key={item.label} className="stat">
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </section>

        <section className="section wrap" id="features">
          <p className="kicker">What&apos;s inside</p>
          <h2>
            Everything you use.
            <span> Nothing you lose.</span>
          </h2>
          <p className="section-lead">
            Astra ships with the launcher, the client, and performance mods. No
            manual file installs.
          </p>
          <div className="feature-panel">
            {FEATURES.map((feature) => (
              <article key={feature.title}>
                <span className="feat-icon" aria-hidden="true">
                  {feature.icon}
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="split wrap" id="mods">
          <div>
            <p className="kicker">Mod browser</p>
            <h2>
              Install mods
              <span> in seconds.</span>
            </h2>
            <p className="section-lead">
              Browse, enable, and configure extras directly inside Astra.
            </p>
          </div>
          <div className="mod-card">
            {BUNDLED.map((mod) => (
              <div key={mod.name} className="mod-row">
                <span>{mod.name}</span>
                <em className={mod.tone}>{mod.tag}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="split split-rev wrap" id="speed">
          <div className="launch-card">
            {LAUNCH_ROWS.map((row) => (
              <div
                key={row.name}
                className={row.accent ? 'launch-row accent' : 'launch-row'}
              >
                <div className="launch-label">
                  <span>{row.name}</span>
                  <strong>{row.time}</strong>
                </div>
                <div className="launch-track">
                  <i style={{ width: row.width }} />
                </div>
              </div>
            ))}
            <p className="launch-note">
              Time to title screen after you press Launch. Shorter is better.
            </p>
          </div>
          <div>
            <p className="kicker">Speed</p>
            <h2>
              Lightspeed
              <span> Minecraft boot.</span>
            </h2>
            <p className="section-lead">
              Astra hits the title screen in about 2–3 seconds. Official, Lunar,
              and Dawn still make you wait.
            </p>
          </div>
        </section>

        <section className="section wrap" id="look">
          <p className="kicker">In game</p>
          <h2>
            Your title screen.
            <span> Your client.</span>
          </h2>
          <p className="section-lead">
            Custom menu on 1.8.9. Esc → Astra Options for HUD, keybinds, and
            modules.
          </p>
          <div className="look-grid">
            <img
              src={asset('/images/screenshots/game-title.jpg')}
              alt="Custom Astra title screen"
            />
            <img
              src={asset('/images/screenshots/client-home.png')}
              alt="Astra Options in game"
            />
          </div>
        </section>

        <section className="cta wrap" id="download">
          <h2>Ready to play faster?</h2>
          <p>
            Download Astra. The launcher and client arrive together — then
            Launch.
          </p>
          <button type="button" className="btn-primary btn-xl" onClick={handleDownload}>
            <WindowsIcon />
            {DOWNLOAD_LABEL}
          </button>
          <p className="hero-meta">{DOWNLOAD_META}</p>
        </section>

        <section className="section wrap" id="faq">
          <p className="kicker">FAQ</p>
          <h2>Straight answers.</h2>
          <div className="faq-list">
            {FAQ.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="foot wrap">
        <a className="brand" href="#top">
          <img src={asset('/images/astra-mark.png')} alt="" width={24} height={24} />
          ASTRA
        </a>
        <p>
          © 2026 Astra Client. Not affiliated with Mojang, Microsoft, Lunar, or
          Dawn.
        </p>
      </footer>
    </div>
  )
}

export default App
