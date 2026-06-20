import { useState, useEffect } from 'react'
import { supabase, isSupabaseConfigured } from './supabaseClient'
import { SplashScreen } from './screens/SplashScreen'
import { AuthScreen } from './screens/AuthScreen'
import { SiaSetup } from './sia/SiaSetup'
import { isSiaConnected } from './sia/siaClient'
import MainApp from './MainApp'

type Screen = 'splash' | 'auth' | 'storage' | 'app'

function resolveInitialScreen(): Screen {
  if (!isSupabaseConfigured) {
    return isSiaConnected() ? 'app' : 'storage'
  }
  return 'splash'
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(resolveInitialScreen)

  useEffect(() => {
    if (!isSupabaseConfigured) return

    supabase.auth.getSession().then((result) => {
      if (result.data.session) {
        setScreen(isSiaConnected() ? 'app' : 'storage')
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
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

  return <MainApp />
}