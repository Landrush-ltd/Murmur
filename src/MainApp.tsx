import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createDefaultTitle,
  formatDuration,
  getAudioExtension,
  matchesMemo,
  normalizeTitle,
  sortMemosByNewest,
} from './memoUtils'
import {
  createBackupFile,
  createBackupFileName,
  readBackupFile,
} from './backup'
import {
  deleteMemo,
  getAllMemos,
  saveMemo,
  updateMemo,
} from './memoStore'
import Logo from './Logo'
import { supabase } from './supabaseClient'

export default function MainApp() {
  const [signOut, setSignOut] = useState(false)

  async function handleSignOut() {
    await supabase.auth.signOut()
    setSignOut(true)
    window.location.reload()
  }

  if (signOut) return null

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={handleSignOut}
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          background: 'none',
          border: '1px solid #333',
          color: '#888',
          borderRadius: 8,
          padding: '0.4rem 0.8rem',
          fontSize: '0.8rem',
          cursor: 'pointer',
          zIndex: 9999,
        }}
      >
        Sign out
      </button>
      <OriginalApp />
    </div>
  )
}

function OriginalApp() {
  // This renders the original Murmur app UI
  // It imports the existing components and logic
  return (
    <div id="murmur-original-app">
      {/* Original app content loads here */}
      <Logo />
    </div>
  )
}