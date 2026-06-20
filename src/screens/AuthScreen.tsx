import { useState } from 'react'
import { supabase } from '../supabaseClient'

interface Props {
  onAuthed: () => void
}

type Mode = 'signin' | 'signup'

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh',
    background: '#0a0a0a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
    fontSize: '14px',
    padding: '24px 16px',
  },
  card: {
    width: '100%',
    maxWidth: '400px',
    background: '#111111',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: '20px',
    padding: '28px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  brandName: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#ffffff',
    letterSpacing: '-0.01em',
  },
  title: {
    fontSize: '22px',
    fontWeight: 700,
    color: '#ffffff',
    letterSpacing: '-0.02em',
    margin: 0,
    lineHeight: 1.2,
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  labelText: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#a3a3a3',
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    background: '#171717',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: '10px',
    color: '#ffffff',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box' as const,
    fontFamily: 'inherit',
    transition: 'border-color 150ms',
  },
  primaryBtn: {
    padding: '11px 18px',
    border: '1px solid transparent',
    borderRadius: '999px',
    background: 'linear-gradient(135deg, #525252 0%, #262626 100%)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    fontFamily: 'inherit',
    transition: 'opacity 150ms',
  },
  errorBox: {
    padding: '10px 12px',
    border: '1px solid rgba(244,63,94,0.25)',
    borderRadius: '10px',
    background: 'rgba(244,63,94,0.08)',
    color: '#fda4af',
    fontSize: '13px',
  },
  successBox: {
    padding: '10px 12px',
    border: '1px solid rgba(34,197,94,0.2)',
    borderRadius: '10px',
    background: 'rgba(34,197,94,0.06)',
    color: '#86efac',
    fontSize: '13px',
  },
  switchRow: {
    textAlign: 'center' as const,
    fontSize: '13px',
    color: '#737373',
    margin: 0,
  },
  switchBtn: {
    background: 'none',
    border: 'none',
    color: '#ffffff',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    padding: '0 2px',
  },
}

export function AuthScreen({ onAuthed }: Props) {
  const [mode, setMode] = useState<Mode>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    setMessage(null)
    if (!email || !password) { setError('Enter your email and password.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }

    setLoading(true)

    if (mode === 'signup') {
      const { error: err } = await supabase.auth.signUp({ email, password })
      if (err) {
        setError(err.message)
      } else {
        setMessage('Check your email for a confirmation link, then sign in.')
        setMode('signin')
      }
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password })
      if (err) { setError(err.message) } else { onAuthed() }
    }

    setLoading(false)
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.brandRow}>
          <img src="/murmur-mark.svg" alt="Murmur" style={{ width: 28, height: 28 }} />
          <span style={s.brandName}>murmur</span>
        </div>

        <h1 style={s.title}>
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </h1>

        {error && <div style={s.errorBox}>{error}</div>}
        {message && <div style={s.successBox}>{message}</div>}

        <div style={s.fieldGroup}>
          <label style={s.label}>
            <span style={s.labelText}>Email</span>
            <input
              style={s.input}
              type="email"
              placeholder="you@example.com"
              value={email}
              autoComplete="email"
              onChange={e => setEmail(e.target.value)}
            />
          </label>
          <label style={s.label}>
            <span style={s.labelText}>Password</span>
            <input
              style={s.input}
              type="password"
              placeholder="Min. 6 characters"
              value={password}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void handleSubmit()}
            />
          </label>
        </div>

        <button
          style={{ ...s.primaryBtn, opacity: loading ? 0.6 : 1 }}
          disabled={loading}
          onClick={() => void handleSubmit()}
        >
          {loading ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>

        <p style={s.switchRow}>
          {mode === 'signup' ? 'Already have an account?' : 'No account yet?'}{' '}
          <button
            style={s.switchBtn}
            onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(null) }}
          >
            {mode === 'signup' ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  )
}
