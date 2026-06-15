import { useEffect } from 'react'

interface Props {
  onDone: () => void
}

export function SplashScreen({ onDone }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2000)
    return () => clearTimeout(timer)
  }, [onDone])

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
      }}>
        <img src="/murmur-mark.svg" alt="Murmur" style={{ width: 80, height: 80 }} />
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>
          Murmur
        </h1>
        <p style={{ fontSize: '1rem', color: '#888', margin: 0 }}>
          Your private voice memos
        </p>
      </div>
    </div>
  )
}