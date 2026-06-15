import { useState } from 'react'
import { supabase } from '../supabaseClient'

interface Props {
  onAuthed: () => void
}

type Mode = 'signin' | 'signup'

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
    if (!email || !password) { setError('Please enter your email and password.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setLoading(true)
    if (mode === 'signup') {
      const { error: err } = await supabase.auth.signUp({ email, password })
      if (err) { setError(err.message) } else {
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
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: '1rem' }}>
      <div style={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: 16, padding: '2rem', width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <img src="/murmur-mark.svg" alt="Murmur" style={{ width: 32, height: 32 }} />
          <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>Murmur</span>
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff', margin: 0 }}>
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </h2>
        {error && <div style={{ background: '#2a0a0a', border: '1px solid #5a1a1a', color: '#ff6b6b', borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.9rem' }}>{error}</div>}
        {message && <div style={{ background: '#0a2a1a', border: '1px solid #1a5a3a', color: '#6bffb8', borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.9rem' }}>{message}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#aaa' }}>Email</label>
          <input style={{ background: '#0a0a0a', border: '1px solid #333', borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.95rem', color: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' as const }} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#aaa' }}>Password</label>
          <input style={{ background: '#0a0a0a', border: '1px solid #333', borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.95rem', color: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' as const }} type="password" placeholder="Min. 6 characters" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
        </div>
        <button style={{ background: loading ? '#3a2070' : '#7c3aed', color: loading ? '#888' : '#fff', border: 'none', borderRadius: 8, padding: '0.85rem', fontSize: '1rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', marginTop: '0.5rem' }} disabled={loading} onClick={handleSubmit}>
          {loading ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
        <p style={{ textAlign: 'center', fontSize: '0.9rem', color: '#666', margin: 0 }}>
          {mode === 'signup' ? 'Already have an account? ' : 'New to Murmur? '}
          <span style={{ color: '#7c3aed', cursor: 'pointer', fontWeight: 600 }} onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(null); setMessage(null) }}>
            {mode === 'signup' ? 'Sign in' : 'Create account'}
          </span>
        </p>
      </div>
    </div>
  )
}