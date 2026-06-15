import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { SplashScreen } from './screens/SplashScreen'
import { AuthScreen } from './screens/AuthScreen'
import { SiaSetup } from './sia/SiaSetup'
import { isSiaConnected } from './sia/siaClient'

type Screen = 'splash' | 'auth' | 'storage' | 'app'

export default function App() {
  const [screen, setScreen] = useState<Screen>('splash')

  useEffect(() => {
    supabase.auth.getSession().then((result: any) => {
      if (result.data.session) {
        if (isSiaConnected()) {
          setScreen('app')
        } else {
          setScreen('storage')
        }
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event: any, session: any) => {
        if (!session) setScreen('auth')
      },
    )

    return () => listener.subscription.unsubscribe()
  }, [])

  if (screen === 'splash') {
    return <SplashScreen onDone={() => setScreen('auth')} />
  }

  if (screen === 'auth') {
    return (
      <AuthScreen
        onAuthed={() => {
          if (isSiaConnected()) {
            setScreen('app')
          } else {
            setScreen('storage')
          }
        }}
      />
    )
  }

  if (screen === 'storage') {
    return <SiaSetup onConnected={() => setScreen('app')} />
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
      flexDirection: 'column',
      gap: '1rem',
    }}>
      <p style={{ color: '#888' }}>✅ Signed in and storage connected.</p>
      <button
        style={{
          background: 'none',
          border: '1px solid #333',
          color: '#888',
          borderRadius: 8,
          padding: '0.5rem 1rem',
          cursor: 'pointer',
          fontSize: '0.85rem',
        }}
        onClick={async () => {
          await supabase.auth.signOut()
          setScreen('auth')
        }}
      >
        Sign out
      </button>
    </div>
  )
}