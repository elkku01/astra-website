import { useEffect, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import './LegalPage.css'

/* Who runs Astra and how to reach us. Support is on the Astra Discord. */
const OPERATOR = 'the Astra Client team'
const SUPPORT_URL = 'https://discord.gg/byKpped2K'
const LAST_UPDATED = '3 October 2026'

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="legal-section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

export default function LegalPage() {
  const { hash } = useLocation()

  useEffect(() => {
    const previous = document.title
    document.title = 'Legal · Astra Client'
    return () => {
      document.title = previous
    }
  }, [])

  useEffect(() => {
    if (!hash) return
    // Jump after the 0.5 s page-enter animation; smooth scrolling would be cut short by it.
    const timer = window.setTimeout(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start', behavior: 'instant' })
    }, 520)
    return () => window.clearTimeout(timer)
  }, [hash])

  return (
    <div className="legal-page">
      <header className="legal-top">
        <Link className="legal-brand" to="/" viewTransition>
          Astra
        </Link>
        <nav aria-label="Legal documents">
          <a href="#privacy">Privacy</a>
          <a href="#terms">Terms</a>
          <a href="#purchases">Purchases</a>
        </nav>
      </header>

      <main className="legal-main">
        <h1>Legal</h1>
        <p className="legal-meta">Last updated {LAST_UPDATED}</p>
        <p className="legal-notice">
          NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.
          Astra Client is also not affiliated with Lunar Client, Discord, Modrinth or CurseForge.
          Minecraft is a trademark of Mojang AB.
        </p>

        {/* ------------------------------------------------------------------ PRIVACY */}
        <Section id="privacy" title="Privacy Policy">
          <p>
            This policy explains what Astra (the Astra Client launcher, the Astra Client mod, this
            website and the Astra store) collects, why, and what you can do about it. Astra is run by
            {OPERATOR} in Finland. For questions, use our{' '}
            <a href={SUPPORT_URL} rel="noreferrer" target="_blank">Discord server</a>.
          </p>

          <h3>What we collect and why</h3>
          <ul>
            <li>
              <strong>Minecraft account in the store.</strong> When you link an account on the website we
              use your Minecraft username and UUID (both public Mojang data) to show your skin and the
              cosmetics you own. We store which cosmetics each UUID owns and your order history so your
              purchases keep working. <em>Basis: contract.</em>
            </li>
            <li>
              <strong>Early-access reward.</strong> When you sign in to the launcher with Minecraft, we
              record your UUID and username once to check whether you are one of the first 1,000 players
              and, if so, to grant the reward. <em>Basis: contract.</em>
            </li>
            <li>
              <strong>Payments.</strong> Payments are processed by Stripe, which acts as the reseller
              (merchant of record). Stripe collects your payment details, email, billing country and
              similar data under its own privacy policy. We never see your card number. We receive
              the order ID, the Minecraft account the purchase is for, the items and the amount.{' '}
              <em>Basis: contract and legal obligations (bookkeeping).</em>
            </li>
            <li>
              <strong>Microsoft / Minecraft sign-in (launcher).</strong> Sign-in tokens are stored only
              on your computer, encrypted with your operating system&apos;s protection, and are only
              sent to Microsoft and Mojang to start the game and to prove your account to Astra&apos;s
              servers. <em>Basis: contract.</em>
            </li>
            <li>
              <strong>Optional Discord sign-in (launcher).</strong> If you connect Discord we use your
              Discord user ID, username, display name, avatar and, if you allow it, your friends list,
              to show which friends use Astra and to let you chat. Discord tokens stay encrypted on
              your computer. <em>Basis: consent (you can disconnect at any time).</em>
            </li>
            <li>
              <strong>Online status and cosmetics sync.</strong> While the launcher runs it sends a
              random install ID and whether you are playing; if you are signed in to Discord, your
              Discord ID. While you play, the mod shares your Minecraft UUID and name, your equipped
              cloak and wings and the server address you are on, so other Astra players on that
              server can see your cosmetics. This data is kept in memory for about 1&ndash;2 minutes
              after you stop sending it. <em>Basis: legitimate interest in providing these features.</em>
            </li>
            <li>
              <strong>Friend chat.</strong> Messages you send to Discord friends through the launcher
              are stored for up to 14 days so both of you can read them, then deleted.{' '}
              <em>Basis: contract.</em>
            </li>
            <li>
              <strong>Crash logs and support tickets.</strong> Only when you choose to send one. A
              crash log can contain your Minecraft name, file paths, mod list and system details. It
              is posted to our private support channel on Discord and kept until the issue is resolved,
              at most 12 months. <em>Basis: consent.</em>
            </li>
            <li>
              <strong>Technical data.</strong> Our servers run on Cloudflare, which processes your IP
              address to deliver the service, stop abuse and enforce rate limits. We do not keep IP
              logs ourselves. <em>Basis: legitimate interest (security).</em>
            </li>
          </ul>
          <p>
            We do not sell your data, show ads or use tracking or advertising cookies. We do not make
            automated decisions that have legal effects on you.
          </p>

          <h3>Browser storage</h3>
          <p>
            The website stores your linked Minecraft name and owned cloaks in your browser&apos;s local
            storage so you stay linked. Clearing site data removes it. Stripe&apos;s checkout page, which
            is run by Stripe, may set its own cookies needed for payments and fraud prevention.
          </p>

          <h3>Services we rely on</h3>
          <p>
            Cloudflare (servers and data storage), GitHub (website hosting and launcher updates),
            Stripe (payments), Discord (sign-in, friends and support), Microsoft and Mojang (Minecraft
            sign-in and game files), Modrinth and CurseForge (mod browsing, descriptions and downloads) and skin
            services (mc-heads.net, minotar.net, crafatar.com, playerdb.co, api.ashcon.app,
            api.minetools.eu) that show Minecraft skins. When your device contacts these services they
            receive your IP address under their own policies. Some are located outside the EU; transfers
            rely on the EU&ndash;US Data Privacy Framework or standard contractual clauses.
          </p>
          <p>
            In the launcher, images inside mod descriptions are loaded from wherever the mod author
            hosts them. In the game, image previews in chat only load when you hover over a link. In
            both cases the site hosting the image sees your IP address.
          </p>

          <h3>How long we keep data</h3>
          <ul>
            <li>Owned cosmetics: as long as you use Astra or until you ask us to delete them.</li>
            <li>Order records: as long as accounting and tax law requires (Stripe keeps the invoices).</li>
            <li>Online status and cosmetics sync: about 1&ndash;2 minutes after you go offline.</li>
            <li>Chat messages: 14 days.</li>
            <li>Crash logs and tickets: until resolved, at most 12 months.</li>
          </ul>

          <h3>Your rights</h3>
          <p>
            You can ask for a copy of your data, correction, deletion, restriction or portability, and
            you can object to processing based on legitimate interest or withdraw consent at any time.
            Open a ticket on our <a href={SUPPORT_URL} rel="noreferrer" target="_blank">Discord server</a>{' '}
            with your Minecraft name and, for Discord features, your Discord username. Deleting owned cosmetics removes them from your
            account permanently. You can also complain to the Finnish Data Protection Ombudsman
            (<a href="https://tietosuoja.fi/en" rel="noreferrer" target="_blank">tietosuoja.fi</a>) or your
            local authority.
          </p>

          <h3>Children</h3>
          <p>
            Astra is not directed at children under 13. If you are under the age of digital consent in
            your country, use the Discord features and make purchases only with a parent or
            guardian&apos;s permission.
          </p>

          <h3>Security and changes</h3>
          <p>
            We use encryption in transit, signed sessions and server-side secrets, but no service is
            perfectly secure. If we change this policy we will update the date above; significant
            changes will also be announced in the launcher or on this site.
          </p>
        </Section>

        {/* ------------------------------------------------------------------ TERMS */}
        <Section id="terms" title="Terms of Service">
          <p>
            These terms apply to the Astra Client launcher, the Astra Client mod, this website and the
            store (together, &quot;Astra&quot;), provided by {OPERATOR}. By using Astra you agree to them.
            If you do not agree, do not use Astra.
          </p>

          <h3>1. Minecraft</h3>
          <p>
            Astra is an unofficial, independent client. You need your own legitimate Minecraft: Java
            Edition account, and the{' '}
            <a href="https://www.minecraft.net/eula" rel="noreferrer" target="_blank">Minecraft EULA</a>{' '}
            and Microsoft&apos;s terms still apply to your use of Minecraft.
          </p>

          <h3>2. Your licence to use Astra</h3>
          <p>
            We give you a personal, non-exclusive, non-transferable, revocable licence to install and
            use Astra for your own non-commercial use. You may not sell, rent or redistribute Astra,
            remove its notices, or modify or reverse engineer it to cheat, to bypass purchases or
            security, or to harm other players or our services.
          </p>

          <h3>3. Acceptable use</h3>
          <ul>
            <li>Follow the rules of every server you play on. Some servers restrict client modifications; a ban from a server is between you and that server.</li>
            <li>Do not use Astra&apos;s chat, friends or support features to harass, spam, threaten or impersonate anyone, or to share illegal content.</li>
            <li>Do not attack, overload, scrape or try to gain unauthorised access to our servers or other players&apos; accounts.</li>
            <li>Do not buy, sell or trade Astra cosmetics or accounts for money outside the official store.</li>
          </ul>
          <p>We may suspend or end access for anyone who breaks these rules.</p>

          <h3>4. Accounts</h3>
          <p>
            You are responsible for your Microsoft, Minecraft and Discord accounts and for activity
            through them. Tell us promptly if you think one was misused in connection with Astra.
          </p>

          <h3>5. Cosmetics</h3>
          <p>
            Cosmetics (cloaks and wings) are a licence to display that item in Astra on the Minecraft
            account (UUID) they were bought for or granted to. They have no monetary value, cannot be
            transferred to another account or exchanged for money, and are visible only to people who
            use Astra. Double-check the Minecraft name before paying; purchases go to that account.
            We may update the look of cosmetics. If we permanently shut down Astra&apos;s cosmetics, we
            will give reasonable notice where possible.
          </p>

          <h3>6. Availability and updates</h3>
          <p>
            Astra is provided &quot;as is&quot;. We work to keep it running but do not guarantee it will
            always be available, error-free or compatible with every mod, server or future Minecraft
            version. Updates may add, change or remove features, and the launcher may require you to
            update before playing.
          </p>

          <h3>7. Liability</h3>
          <p>
            To the extent the law allows, we are not liable for indirect or consequential losses, lost
            data or game progress, server bans or problems caused by third-party mods or services, and
            our total liability is limited to the amount you paid us in the 12 months before the claim.
            Nothing in these terms limits liability that cannot be limited by law, or your rights as a
            consumer under mandatory law.
          </p>

          <h3>8. Intellectual property</h3>
          <p>
            Astra, its code, artwork and cosmetics belong to {OPERATOR} or its licensors. Other names and
            trademarks belong to their owners. If you believe something in Astra infringes your rights,
            tell us on our <a href={SUPPORT_URL} rel="noreferrer" target="_blank">Discord server</a> and we
            will review it promptly.
          </p>

          <h3>9. Changes, law and contact</h3>
          <p>
            We may update these terms; we will change the date above and, for significant changes, tell
            you in the launcher or on this site. Continued use means you accept the updated terms. These
            terms are governed by the laws of Finland. If you are a consumer, you keep the protection of
            the mandatory laws of your country of residence and may bring claims there. Questions: ask on
            our <a href={SUPPORT_URL} rel="noreferrer" target="_blank">Discord server</a>.
          </p>
        </Section>

        {/* ------------------------------------------------------------------ PURCHASES */}
        <Section id="purchases" title="Purchases">
          <h3>Who sells to you</h3>
          <p>
            Store orders are processed by Stripe as the reseller (merchant of record). Stripe handles
            payment, invoices and VAT or sales tax, and its{' '}
            <a href="https://stripe.com/legal/consumer" rel="noreferrer" target="_blank">consumer terms</a> apply
            to the payment. Prices shown include tax where tax applies. Your cosmetics are delivered to
            the Minecraft account you chose, usually within seconds of payment.
          </p>

          <h3>All purchases are final</h3>
          <p>
            Cosmetics are digital content delivered immediately. All purchases are final: we do not
            offer refunds, exchanges or cancellations, including for change of mind, for buying the wrong
            item or for a ban from a server. Check the item and the Minecraft name before you pay.
          </p>
          <p>
            In the EU, EEA and UK, at checkout you ask us to deliver immediately and acknowledge that you
            therefore lose your 14-day right of withdrawal once the cosmetic is delivered. If you do not
            want to give that up, do not complete the purchase.
          </p>
          <p>
            If something you paid for did not arrive on your account, ask on our{' '}
            <a href={SUPPORT_URL} rel="noreferrer" target="_blank">Discord server</a> with your Minecraft
            name and your Stripe receipt and we will deliver it. A purchase that is charged back is removed
            from the account. Nothing here limits rights you have under mandatory consumer law.
          </p>

          <h3>Limited items and rewards</h3>
          <p>
            The launch collection is limited to 100 copies. Once sold out it cannot be bought again.
            Individual cloaks and wings stay available unless we announce otherwise.
          </p>
          <p>
            Obsidian Wings are a free early-access reward for the first 1,000 Minecraft accounts that
            sign in to the Astra launcher. They cannot be bought, and once all 1,000 are claimed they are
            no longer given out.
          </p>
        </Section>
      </main>
    </div>
  )
}
