import { useState } from 'react'

interface Props {
  onConnected: () => void
}

export function SiaSetup({ onConnected }: Props) {
  const [loading, setLoading] = useState(false)

  function handleSetup() {
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      onConnected()
    }, 1000)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#161616', borderRadius: 16, padding: '2rem', width: 360, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h2 style={{ color: '#fff', margin: 0 }}>Set up storage</h2>
        <p style={{ color: '#888', margin: 0 }}>Connect your private Sia storage.</p>
        <button
          disabled={loading}
          onClick={handleSetup}
          style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '0.85rem', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}
        >
          {loading ? 'Connecting…' : 'Connect storage'}
        </button>
      </div>
    </div>
  )
}