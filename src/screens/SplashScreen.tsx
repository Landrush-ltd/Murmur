import { useEffect } from 'react'

interface Props {
  onDone: () => void
}

export function SplashScreen({ onDone }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDone, 1600)
    return () => clearTimeout(timer)
  }, [onDone])

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#0a0a0a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '14px',
      }}>
        <img src="/murmur-mark.svg" alt="Murmur" style={{ width: 52, height: 52 }} />
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', margin: 0, letterSpacing: '-0.01em' }}>
            murmur
          </p>
          <p style={{ fontSize: '13px', color: '#737373', margin: '4px 0 0' }}>
            Private voice memos
          </p>
        </div>
      </div>
    </div>
  )
}
