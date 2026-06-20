import { useState, type FormEvent } from 'react'
import { submitDemoRequest } from '../demoRequest'

const FEATURES = [
  {
    title: 'Voice-first capture',
    description:
      'Record memos in one tap. Auto-transcription turns speech into searchable text while you keep the original audio.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z" strokeLinecap="round" />
        <path d="M19 11a7 7 0 0 1-14 0M12 18v3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Rich notes workspace',
    description:
      'Organize recordings and written notes in nested folders, favorites, and recents — a calm workspace built for thinking.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <path d="M4 6h16M4 12h10M4 18h14" strokeLinecap="round" />
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
      </svg>
    ),
  },
  {
    title: 'Private by design',
    description:
      'Your memos stay on your device first. Optional Sia decentralised backup keeps audio off centralised servers.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <path d="M12 3 5 6v6c0 4.4 3 8.5 7 9.5 4-1 7-5.1 7-9.5V6l-7-3Z" strokeLinejoin="round" />
        <path d="m9.5 12 1.8 1.8L15 10.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Works everywhere',
    description:
      'Install Murmur as a PWA on desktop or mobile. Record, review, and sync without opening a bloated desktop app.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
        <path d="M11 18.5h2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Tags & search',
    description:
      'Find anything fast with tags, full-text search across transcripts, and a sidebar that scales with your library.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <circle cx="11" cy="11" r="6" />
        <path d="m16 16 4.5 4.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Encrypted backup',
    description:
      'Connect your own Sia storage for encrypted off-device copies. You control the keys and the infrastructure.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <path d="M7 11V8a5 5 0 0 1 10 0v3" strokeLinecap="round" />
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M12 15v2" strokeLinecap="round" />
      </svg>
    ),
  },
] as const

const STEPS = [
  {
    step: '01',
    title: 'Capture in the moment',
    body: 'Hit record and speak naturally. Murmur saves locally instantly — no upload lag, no waiting on the cloud.',
  },
  {
    step: '02',
    title: 'Review and refine',
    body: 'Transcripts appear alongside audio. Edit notes, add tags, and file memos into folders as your ideas evolve.',
  },
  {
    step: '03',
    title: 'Back up on your terms',
    body: 'Keep everything on-device or connect Sia for encrypted decentralised backup you own end to end.',
  },
] as const

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function DemoForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [teamSize, setTeamSize] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim() || !email.trim()) {
      setError('Please enter your name and work email.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.')
      return
    }

    setLoading(true)
    const result = await submitDemoRequest({
      name: name.trim(),
      email: email.trim(),
      company: company.trim(),
      team_size: teamSize,
      message: message.trim(),
    })
    setLoading(false)

    if (result.ok) {
      setSubmitted(true)
      return
    }
    setError(result.error ?? 'Something went wrong. Please try again.')
  }

  if (submitted) {
    return (
      <div className="landing-demo-success">
        <div className="landing-demo-success-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m5 12 5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h3>Request received</h3>
        <p>
          Thanks, {name.split(' ')[0] || 'there'}. We&apos;ll reach out at{' '}
          <strong>{email}</strong> within one business day to schedule your demo.
        </p>
      </div>
    )
  }

  return (
    <form className="landing-demo-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
      {error && <div className="landing-form-error">{error}</div>}

      <div className="landing-form-grid">
        <label className="landing-field">
          <span className="landing-field-label">Full name</span>
          <input
            type="text"
            placeholder="Alex Morgan"
            value={name}
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="landing-field">
          <span className="landing-field-label">Work email</span>
          <input
            type="email"
            placeholder="you@company.com"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="landing-field">
          <span className="landing-field-label">Company</span>
          <input
            type="text"
            placeholder="Acme Inc."
            value={company}
            autoComplete="organization"
            onChange={(e) => setCompany(e.target.value)}
          />
        </label>

        <label className="landing-field">
          <span className="landing-field-label">Team size</span>
          <select value={teamSize} onChange={(e) => setTeamSize(e.target.value)}>
            <option value="">Select…</option>
            <option value="1-5">1–5 people</option>
            <option value="6-20">6–20 people</option>
            <option value="21-100">21–100 people</option>
            <option value="100+">100+ people</option>
          </select>
        </label>
      </div>

      <label className="landing-field landing-field-full">
        <span className="landing-field-label">What would you like to see?</span>
        <textarea
          rows={4}
          placeholder="Tell us about your workflow, privacy requirements, or team use case…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>

      <button type="submit" className="landing-btn landing-btn-primary landing-btn-wide" disabled={loading}>
        {loading ? 'Sending…' : 'Request demo'}
      </button>

      <p className="landing-form-note">
        No spam. We&apos;ll only use your details to schedule a walkthrough.
      </p>
    </form>
  )
}

function AppPreview() {
  return (
    <div className="landing-preview" aria-hidden="true">
      <div className="landing-preview-chrome">
        <span /><span /><span />
      </div>
      <div className="landing-preview-body">
        <aside className="landing-preview-sidebar">
          <div className="landing-preview-logo" />
          <div className="landing-preview-nav-item active" />
          <div className="landing-preview-nav-item" />
          <div className="landing-preview-nav-item" />
          <div className="landing-preview-nav-item dim" />
          <div className="landing-preview-nav-item dim" />
        </aside>
        <main className="landing-preview-main">
          <div className="landing-preview-header">
            <div className="landing-preview-title" />
            <div className="landing-preview-pill" />
          </div>
          <div className="landing-preview-wave">
            {Array.from({ length: 32 }, (_, i) => (
              <span key={i} style={{ ['--h' as string]: `${20 + Math.sin(i * 0.55) * 18 + (i % 3) * 6}%` }} />
            ))}
          </div>
          <div className="landing-preview-transcript">
            <div /><div /><div className="short" />
          </div>
        </main>
      </div>
    </div>
  )
}

export function LandingPage() {
  return (
    <div className="landing">
      <div className="landing-bg" aria-hidden="true">
        <div className="landing-bg-glow landing-bg-glow-a" />
        <div className="landing-bg-glow landing-bg-glow-b" />
        <div className="landing-bg-grid" />
      </div>

      <header className="landing-nav">
        <a href="/" className="landing-brand">
          <img src="/murmur-mark.svg" alt="" width={28} height={28} />
          <span>murmur</span>
        </a>

        <nav className="landing-nav-links" aria-label="Page sections">
          <button type="button" onClick={() => scrollTo('features')}>Features</button>
          <button type="button" onClick={() => scrollTo('how-it-works')}>How it works</button>
          <button type="button" onClick={() => scrollTo('privacy')}>Privacy</button>
        </nav>

        <div className="landing-nav-actions">
          <a href="/app" className="landing-btn landing-btn-ghost">Open app</a>
          <button type="button" className="landing-btn landing-btn-primary" onClick={() => scrollTo('demo')}>
            Request demo
          </button>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">Privacy-first voice workspace</p>
            <h1>Capture ideas by voice. Keep them yours.</h1>
            <p className="landing-lead">
              Murmur is a calm, production-ready workspace for voice memos, transcripts,
              and rich notes — with local-first storage and optional encrypted Sia backup.
              Built for people who think out loud and care where their data lives.
            </p>
            <div className="landing-hero-cta">
              <button type="button" className="landing-btn landing-btn-primary" onClick={() => scrollTo('demo')}>
                Request a demo
              </button>
              <a href="/app" className="landing-btn landing-btn-secondary">Try the app</a>
            </div>
            <ul className="landing-hero-points">
              <li>Local-first recording</li>
              <li>Auto transcription</li>
              <li>Sia encrypted backup</li>
            </ul>
          </div>

          <div className="landing-hero-visual">
            <AppPreview />
          </div>
        </section>

        <section id="features" className="landing-section">
          <div className="landing-section-head">
            <p className="landing-eyebrow">Everything you need</p>
            <h2>A complete voice memo workspace</h2>
            <p>
              From quick captures to long-form thinking, Murmur combines recording,
              writing, and organisation in one focused interface.
            </p>
          </div>

          <div className="landing-feature-grid">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="landing-feature-card">
                <div className="landing-feature-icon">{feature.icon}</div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="landing-section landing-section-muted">
          <div className="landing-section-head">
            <p className="landing-eyebrow">Simple workflow</p>
            <h2>From thought to archive in three steps</h2>
          </div>

          <div className="landing-steps">
            {STEPS.map((item) => (
              <article key={item.step} className="landing-step">
                <span className="landing-step-num">{item.step}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="privacy" className="landing-section">
          <div className="landing-privacy">
            <div className="landing-privacy-copy">
              <p className="landing-eyebrow">Privacy by architecture</p>
              <h2>Your memos shouldn&apos;t live on someone else&apos;s hard drive</h2>
              <p>
                Murmur stores recordings in your browser first. Authentication and sync
                are optional — and when you enable backup, Sia&apos;s decentralised
                storage keeps files encrypted without routing them through a central
                content warehouse.
              </p>
              <ul className="landing-privacy-list">
                <li>On-device IndexedDB storage for instant access</li>
                <li>Optional account for cross-device sign-in</li>
                <li>Bring-your-own Sia storage for encrypted backup</li>
                <li>No ad tracking, no data resale, no dark patterns</li>
              </ul>
            </div>
            <div className="landing-privacy-panel">
              <div className="landing-privacy-stat">
                <span className="landing-privacy-stat-value">Local</span>
                <span className="landing-privacy-stat-label">Recordings stay on your device first</span>
              </div>
              <div className="landing-privacy-stat">
                <span className="landing-privacy-stat-value">Encrypted</span>
                <span className="landing-privacy-stat-label">Sia backup under your control</span>
              </div>
              <div className="landing-privacy-stat">
                <span className="landing-privacy-stat-value">Open</span>
                <span className="landing-privacy-stat-label">Install as a PWA on any platform</span>
              </div>
            </div>
          </div>
        </section>

        <section id="demo" className="landing-section landing-demo-section">
          <div className="landing-demo-wrap">
            <div className="landing-demo-copy">
              <p className="landing-eyebrow">See it live</p>
              <h2>Request a personalised demo</h2>
              <p>
                Walk through recording, transcription, folder organisation, and Sia
                backup with our team. We&apos;ll tailor the session to your workflow
                and privacy requirements.
              </p>
              <ul className="landing-demo-benefits">
                <li>30-minute guided walkthrough</li>
                <li>Privacy &amp; deployment Q&amp;A</li>
                <li>Early access for teams evaluating Murmur</li>
              </ul>
            </div>
            <DemoForm />
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <a href="/" className="landing-brand">
            <img src="/murmur-mark.svg" alt="" width={24} height={24} />
            <span>murmur</span>
          </a>
          <p>Private voice memos for people who think out loud.</p>
          <div className="landing-footer-links">
            <a href="/app">Open app</a>
            <button type="button" onClick={() => scrollTo('demo')}>Request demo</button>
          </div>
          <p className="landing-footer-copy">&copy; {new Date().getFullYear()} Murmur. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
