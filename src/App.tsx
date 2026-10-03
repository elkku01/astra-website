import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { startLauncherDownload } from './download'
import SiteNav, { DISCORD_URL, DiscordIcon } from './SiteNav'
import './App.css'
import './Home.css'

// The 3D preview is heavy (three.js); load it only when the home page shows it.
const WingPreview = lazy(() => import('./store/WingPreview'))

function asset(path: string) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
}

const LAUNCHER_VERSION = '0.3.17'

const SHOTS = [
  { id: 'home', label: 'Home', src: asset('/images/screenshots/v2-home.jpg') },
  { id: 'instances', label: 'Instances', src: asset('/images/screenshots/v2-instances.jpg') },
  { id: 'friends', label: 'Friends', src: asset('/images/screenshots/v2-friends.jpg') },
  { id: 'settings', label: 'Settings', src: asset('/images/screenshots/v2-settings.jpg') },
]

const CARDS = [
  {
    icon: 'L',
    title: 'One launcher',
    body: 'Minecraft 1.8.9, 1.21.5 and 1.21.11 with Microsoft sign-in, several accounts and Java set up for you.',
  },
  {
    icon: 'M',
    title: 'In-game mods',
    body: 'Movable HUD, zoom, 1.7 visuals, nametags, hitboxes and more. Open the menu with Right Shift.',
  },
  {
    icon: 'F',
    title: 'Friends and chat',
    body: 'Sign in with Discord to see who is playing, send messages and images, and get a ping when someone writes.',
  },
]

const INSTANCE_POINTS = [
  'Make as many instances as you want, each with its own mods, packs, shaders and worlds',
  'Install mods, resource packs and shaders from Modrinth and CurseForge in the launcher',
  'Bring your setups from Lunar, Prism, MultiMC, the Modrinth App, CurseForge and more, keybinds included',
  'Keep settings, servers and packs in sync across instances, or keep them separate',
]

const CLOAK_ROW = ['torii', 'gojo', 'void', 'miku', 'aura', 'monster']

const FAQ = [
  {
    q: 'What is Astra?',
    a: 'A Windows launcher with the Astra client built in: play, instances, friends and settings in one window, and HUD, cosmetics and performance mods in game.',
  },
  {
    q: 'Do I download the client separately?',
    a: 'No. The installer is the launcher, and the Astra client comes with every supported version and updates by itself.',
  },
  {
    q: 'Which versions are supported?',
    a: 'Minecraft 1.8.9 (Forge with OptiFine), 1.21.5 and 1.21.11 (Fabric). Loaders and Java are handled for you.',
  },
  {
    q: 'Can I import Lunar or another launcher?',
    a: 'Yes: Lunar, Prism, MultiMC, PolyMC, the Modrinth App, CurseForge, ATLauncher, GDLauncher and Frost. Astra brings over the version, mods, packs, shaders and your game settings.',
  },
  {
    q: 'Is this a cheat client?',
    a: 'No. Astra is HUD, cosmetics and quality of life: sprint, zoom, nametags, hitboxes, 1.7 visuals. There is no combat cheating.',
  },
  {
    q: 'What do I need to play?',
    a: 'Windows 10 or 11 and a Microsoft account with Minecraft: Java Edition for online play. Astra downloads the right Java the first time you press Launch.',
  },
]

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
  const [open, setOpen] = useState<number | null>(0)
  const { hash } = useLocation()

  // Coming from another page (e.g. /#features), the router does not scroll to the section by itself.
  useEffect(() => {
    if (!hash) return
    const timer = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 120)
    return () => window.clearTimeout(timer)
  }, [hash])

  return (
    <div className="home" id="top">
      <SiteNav />

      <main>
        <section className="home-hero">
          <div className="home-hero-copy">
            <img className="home-logo" src={asset('/images/astra-logo.png')} alt="Astra Client" width={360} />
            <p className="home-lead">
              A PvP client for Minecraft 1.8.9, 1.21.5 and 1.21.11 with its own launcher, instances, friends and chat,
              and cosmetics.
            </p>
            <div className="home-cta">
              <button type="button" className="home-btn primary" onClick={() => void startLauncherDownload()}>
                <WindowsIcon />
                Download for Windows
              </button>
              <Link className="home-btn ghost" to="/store" viewTransition>
                Browse cosmetics
              </Link>
            </div>
            <p className="home-meta">v{LAUNCHER_VERSION} · Windows 10/11 · Free</p>
          </div>
          <div className="home-shot">
            <img src={SHOTS[shot].src} alt={`Astra launcher: ${SHOTS[shot].label}`} />
            <div className="home-shot-tabs" role="tablist" aria-label="Launcher screenshots">
              {SHOTS.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={index === shot}
                  className={index === shot ? 'on' : undefined}
                  onClick={() => setShot(index)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="home-cards" id="features">
          {CARDS.map((card) => (
            <article key={card.title} className="home-card">
              <span className="home-card-icon" aria-hidden="true">
                {card.icon}
              </span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </article>
          ))}
        </section>

        <section className="home-split">
          <div className="home-split-copy">
            <p className="home-kicker">Instances</p>
            <h2>Your setups, your way.</h2>
            <p className="home-sub">
              Create an instance in a few clicks for any supported version, fill it with mods from Modrinth and
              CurseForge, or import everything from the launcher you use now.
            </p>
            <ul className="home-points">
              {INSTANCE_POINTS.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <button type="button" className="home-btn primary" onClick={() => void startLauncherDownload()}>
              Get Astra and create one
            </button>
          </div>
          <div className="home-shot is-plain">
            <img src={asset('/images/screenshots/v2-instances.jpg')} alt="Astra instances" loading="lazy" />
          </div>
        </section>

        <section className="home-cosmetics">
          <div className="home-cosmetics-art">
            <Suspense fallback={<div className="home-preview-wait" />}>
              <WingPreview wingId="purple" pose="walking" width={380} height={320} zoom={0.85} />
            </Suspense>
          </div>
          <div className="home-cosmetics-copy">
            <p className="home-kicker">Cosmetics</p>
            <h2>Wings and cloaks</h2>
            <p className="home-sub">Try them on your own skin, exactly as they look in game. Other Astra players see them too.</p>
            <div className="home-cloaks">
              {CLOAK_ROW.map((id) => (
                <Link key={id} to={`/store/cape/${id}`} viewTransition aria-label={`"${id}" cloak`}>
                  <img src={asset(`/capes/thumbs/${id}.png`)} alt="" loading="lazy" />
                </Link>
              ))}
            </div>
            <Link className="home-btn primary" to="/store" viewTransition>
              Open the store
            </Link>
          </div>
        </section>

        <section className="home-faq" id="faq">
          <p className="home-kicker">FAQ</p>
          <h2>Questions</h2>
          <div className="home-faq-grid">
            {FAQ.map((item, index) => (
              <div key={item.q} className={open === index ? 'home-faq-item open' : 'home-faq-item'}>
                <button type="button" aria-expanded={open === index} onClick={() => setOpen(open === index ? null : index)}>
                  {item.q}
                  <span aria-hidden="true">{open === index ? '−' : '+'}</span>
                </button>
                {open === index ? <p>{item.a}</p> : null}
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <div className="home-footer-brand">
          <img src={asset('/images/astra-mark.png')} alt="" width={24} height={24} />
          <span>ASTRA</span>
          <p>Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.</p>
        </div>
        <div>
          <h4>Product</h4>
          <button type="button" onClick={() => void startLauncherDownload()}>
            Download
          </button>
          <a href="#features">Features</a>
          <Link to="/status">Status</Link>
        </div>
        <div>
          <h4>Store</h4>
          <Link to="/store">Cosmetics</Link>
          <Link to="/store/my-cosmetics">My cosmetics</Link>
        </div>
        <div>
          <h4>Support</h4>
          <a href={DISCORD_URL} target="_blank" rel="noreferrer">
            <DiscordIcon /> Discord
          </a>
          <a href="mailto:support.astraclient@gmail.com">support.astraclient@gmail.com</a>
        </div>
        <div>
          <h4>Legal</h4>
          <Link to="/legal#privacy">Privacy</Link>
          <Link to="/legal#terms">Terms</Link>
          <Link to="/legal#purchases">Purchases</Link>
        </div>
      </footer>
    </div>
  )
}

export default App
