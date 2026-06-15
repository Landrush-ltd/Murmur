import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { SplashScreen } from './screens/SplashScreen'
import { AuthScreen } from './screens/AuthScreen'
import { SiaSetup } from './sia/SiaSetup'
import { isSiaConnected } from './sia/siaClient'
import MainApp from './MainApp'

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

  return <MainApp />
}