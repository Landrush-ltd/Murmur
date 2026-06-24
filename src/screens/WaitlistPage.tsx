import { useState, type FormEvent } from 'react'
import { submitWaitlistSignup } from '../waitlist'

const PERKS = [
  'Early access before public launch',
  'Founding member pricing when we ship',
  'Direct line to the team for feedback',
] as const

function WaitlistForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email.trim()) {
      setError('Please enter your email address.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.')
      return
    }

    setLoading(true)
    const result = await submitWaitlistSignup({
      name: name.trim(),
      email: email.trim(),
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
      <div className="landing-demo-success waitlist-success">
        <div className="landing-demo-success-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m5 12 5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h3>You&apos;re on the list</h3>
        <p>
          {name.trim() ? (
            <>
              Thanks, {name.split(' ')[0]}. We&apos;ll reach out at{' '}
              <strong>{email}</strong> when your spot opens up.
            </>
          ) : (
            <>
              We&apos;ll reach out at <strong>{email}</strong> when your spot opens up.
            </>
          )}
        </p>
      </div>
    )
  }

  return (
    <form className="landing-demo-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
      {error && <div className="landing-form-error">{error}</div>}

      <label className="landing-field">
        <span className="landing-field-label">Email</span>
        <input
          type="email"
          placeholder="you@email.com"
          value={email}
          autoComplete="email"
          required
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      <label className="landing-field">
        <span className="landing-field-label">Name <span className="waitlist-optional">(optional)</span></span>
        <input
          type="text"
          placeholder="Alex Morgan"
          value={name}
          autoComplete="name"
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <button type="submit" className="landing-btn landing-btn-primary landing-btn-wide" disabled={loading}>
        {loading ? 'Joining…' : 'Join the waitlist'}
      </button>

      <p className="landing-form-note">
        No spam. Unsubscribe anytime.
      </p>
    </form>
  )
}

export function WaitlistPage() {
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

        <div className="landing-nav-actions">
          <a href="/" className="landing-btn landing-btn-ghost">Home</a>
          <a href="/app" className="landing-btn landing-btn-primary">Open app</a>
        </div>
      </header>

      <main className="waitlist-main">
        <section className="waitlist-hero">
          <div className="waitlist-copy">
            <p className="landing-eyebrow">Early access</p>
            <h1>Join the Murmur waitlist</h1>
            <p className="landing-lead">
              Be first in line for a privacy-first voice workspace — local recording,
              auto transcription, and optional encrypted Sia backup.
            </p>

            <ul className="landing-demo-benefits waitlist-perks">
              {PERKS.map((perk) => (
                <li key={perk}>{perk}</li>
              ))}
            </ul>
          </div>

          <div className="waitlist-card">
            <WaitlistForm />
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
            <a href="/">Home</a>
            <a href="/app">Open app</a>
          </div>
          <p className="landing-footer-copy">&copy; {new Date().getFullYear()} Murmur. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
