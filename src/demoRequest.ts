import { isSupabaseConfigured, supabase } from './supabaseClient'

export interface DemoRequestPayload {
  name: string
  email: string
  company: string
  team_size: string
  message: string
}

export async function submitDemoRequest(
  payload: DemoRequestPayload,
): Promise<{ ok: boolean; error?: string }> {
  const webhook = import.meta.env.VITE_DEMO_WEBHOOK_URL as string | undefined
  if (webhook?.startsWith('http')) {
    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, source: 'murmur-landing' }),
      })
      if (res.ok) return { ok: true }
      return { ok: false, error: 'Unable to submit your request. Please try again.' }
    } catch {
      return { ok: false, error: 'Network error. Check your connection and try again.' }
    }
  }

  if (isSupabaseConfigured) {
    const { error } = await supabase.from('demo_requests').insert({
      ...payload,
      created_at: new Date().toISOString(),
    })
    if (!error) return { ok: true }
    return {
      ok: false,
      error: 'Unable to submit your request. Please email us at hello@murmur.app.',
    }
  }

  return {
    ok: false,
    error: 'Demo requests are not configured yet. Email hello@murmur.app to schedule a walkthrough.',
  }
}
