import { isSupabaseConfigured, supabase } from './supabaseClient'

export interface WaitlistPayload {
  email: string
  name: string
}

export async function submitWaitlistSignup(
  payload: WaitlistPayload,
): Promise<{ ok: boolean; error?: string }> {
  const webhook = import.meta.env.VITE_WAITLIST_WEBHOOK_URL as string | undefined
  if (webhook?.startsWith('http')) {
    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, source: 'murmur-waitlist' }),
      })
      if (res.ok) return { ok: true }
      return { ok: false, error: 'Unable to join the waitlist. Please try again.' }
    } catch {
      return { ok: false, error: 'Network error. Check your connection and try again.' }
    }
  }

  if (isSupabaseConfigured) {
    const { error } = await supabase.from('waitlist').insert({
      ...payload,
      created_at: new Date().toISOString(),
    })
    if (!error) return { ok: true }
    return {
      ok: false,
      error: 'Unable to join the waitlist. Please email hello@murmur.app.',
    }
  }

  return {
    ok: false,
    error: 'Waitlist signups are not configured yet. Email hello@murmur.app to get early access.',
  }
}
