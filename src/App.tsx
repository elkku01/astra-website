import { useState } from 'react'
import { Link } from 'react-router-dom'
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
  { href: '#faq', label: 'FAQ' },
]

const SHOTS = [
  {
    src: asset('/images/screenshots/launcher-home.jpg'),
    alt: 'Astra launcher home with Launch',
  },
  {
    src: asset('/images/screenshots/launcher-instances.png'),
    alt: 'Astra instances, including an import from Lunar',
  },
  {
    src: asset('/images/screenshots/launcher-friends.png'),
    alt: 'Astra friends list and chat',
  },
  {
    src: asset('/images/screenshots/launcher-settings.png'),
    alt: 'Astra launcher settings',
  },
  {
    src: asset('/images/screenshots/client-cosmetics.png'),
    alt: 'In-game Astra cloaks and cosmetics',
  },
]

const STATS = [
  { value: '3', label: 'Minecraft versions' },
  { value: 'HUD', label: 'Modules you can move' },
  { value: 'Discord', label: 'Friends and chat' },
  { value: '1', label: 'Installer, client included' },
]

const FEATURES = [
  {
    title: 'One-click play',
    body: '1.8.9 on Forge with OptiFine, plus 1.21.5 and 1.21.11 on Fabric. Microsoft sign-in, guest play, and multiple accounts. Java is installed for you.',
  },
  {
    title: 'Astra Client',
    body: 'Ships with every supported version. Custom HUD, cleaner nametags, and tools built for Hypixel-style PvP. It stays installed through launcher updates.',
  },
  {
    title: 'Performance',
    body: 'One switch for optimizations. Modern versions get a Sodium-style PvP stack; 1.8.9 gets OptiFine. Enable shaders and the loader is installed for you.',
  },
  {
    title: 'Instances',
    body: 'Create, duplicate, export, and import. Bring Lunar, Prism, Modrinth, CurseForge, and more. Mods, packs, shaders, and worlds stay in one place.',
  },
  {
    title: 'Mods and content',
    body: 'Search Modrinth and CurseForge for mods, resource packs, and shaders. Duplicate and version checks run before anything breaks an instance.',
  },
  {
    title: 'Friends and cloaks',
    body: 'Sign in with Discord, chat, and see who is in Astra, in game, or on Lunar. Cloaks from the store show in the client.',
  },
]

const BUNDLED = [
  { name: 'Astra Client', tag: 'Every version', tone: 'in' },
  { name: 'OptiFine', tag: '1.8.9', tone: 'in' },
  { name: 'Sodium stack', tag: '1.21.5 / 1.21.11', tone: 'in' },
  { name: 'Iris / OptiFine shaders', tag: 'On demand', tone: 'req' },
  { name: 'Modrinth + CurseForge', tag: 'Browse', tone: 'add' },
]

const FAQ = [
  {
    q: 'What is Astra?',
    a: 'A compact Windows launcher with Astra Client built in. Play, instances, friends, and settings in one window — HUD, cloaks, and performance mods in game.',
  },
  {
    q: 'Do I download the client separately?',
    a: 'No. The installer is the launcher. Astra Client ships with every supported version and stays installed through updates.',
  },
  {
    q: 'Which versions are supported?',
    a: 'Minecraft 1.8.9 (Forge + OptiFine), 1.21.5 (Fabric), and 1.21.11 (Fabric). Loaders and Java are handled for you.',
  },
  {
    q: 'Can I import Lunar or another launcher?',
    a: 'Yes. Lunar, Prism, MultiMC, PolyMC, the Modrinth App, CurseForge, ATLauncher, GDLauncher, and Frost. Astra brings in the instance, version, mods, packs, and shaders.',
  },
  {
    q: 'Is this a cheat client?',
    a: 'No. Astra is HUD, cosmetics, and quality-of-life — sprint, zoom, nametags, hitboxes, 1.7 visuals. There is no combat cheating.',
  },
  {
    q: 'What do I need to play?',
    a: 'Windows, and a Microsoft account for Java Edition if you want online play. Guest play works too. Astra downloads the right Java the first time you press Launch.',
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
          <Link to="/store" viewTransition>
            Store
          </Link>
          <Link to="/status" viewTransition>
            Status
          </Link>
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
            Launcher, client, and cloaks in one download. Play 1.8.9, 1.21.5, and
            1.21.11 — then keep your HUD, friends, and instances in the same place.
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
            Windows · Microsoft or guest · Java installs on Launch
          </p>
        </section>

        <section className="carousel wrap" aria-label="Product screenshots">
          <div className="carousel-frame">
            <img key={current.src} src={current.src} alt={current.alt} />
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
            Play, customize,
            <span> stay in control.</span>
          </h2>
          <p className="section-lead">
            One installer. The launcher, Astra Client, and performance stack
            arrive together.
          </p>
          <div className="feature-panel">
            {FEATURES.map((feature) => (
              <article key={feature.title}>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="split wrap" id="mods">
          <div>
            <p className="kicker">Mods and content</p>
            <h2>
              Modrinth and CurseForge
              <span> in the launcher.</span>
            </h2>
            <p className="section-lead">
              Install mods, resource packs, and shaders. Enable or disable them
              without deleting files. Sync settings, packs, and servers across
              1.8.9, 1.21.5, and 1.21.11.
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

        <section className="section wrap" id="look">
          <p className="kicker">In game</p>
          <h2>
            HUD, modules,
            <span> and cloaks.</span>
          </h2>
          <p className="section-lead">
            Open Mods for sprint, zoom, nametags, and movable HUD pieces. Open
            Cosmetics for cloaks from the store.
          </p>
          <div className="look-grid">
            <img
              src={asset('/images/screenshots/client-home.png')}
              alt="In-game Astra modules and HUD"
            />
            <img
              src={asset('/images/screenshots/client-cosmetics.png')}
              alt="In-game Astra cloaks and cosmetics"
            />
          </div>
        </section>

        <section className="cta wrap" id="download">
          <h2>Ready to launch?</h2>
          <p>
            Download Astra. The launcher, client, and Java setup arrive together —
            then press Launch.
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
          <Link to="/store" viewTransition>
            Store
          </Link>
          <span aria-hidden="true"> · </span>
          <Link to="/status" viewTransition>
            Status
          </Link>
          <span aria-hidden="true"> · </span>
          <Link to="/legal#privacy">Privacy</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/legal#terms">Terms</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/legal#purchases">Purchases</Link>
          <span aria-hidden="true"> · </span>
          <a href="https://discord.gg/byKpped2K" rel="noreferrer" target="_blank">
            Support (Discord)
          </a>
          <span aria-hidden="true"> · </span>
          © 2026 Astra Client. Not an official Minecraft product. Not approved by or
          associated with Mojang or Microsoft. Not affiliated with Lunar or Dawn.
        </p>
      </footer>
    </div>
  )
}

export default App
