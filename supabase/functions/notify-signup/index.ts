import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const ALERT_EMAIL = Deno.env.get('ALERT_EMAIL') // ton email perso

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    if (!RESEND_API_KEY || !ALERT_EMAIL) {
      throw new Error('RESEND_API_KEY or ALERT_EMAIL not configured')
    }

    const payload = await req.json()
    // Database webhook sends: { type: "INSERT", table: "users", record: {...}, ... }
    const record = payload.record ?? payload
    const email = record.email ?? 'inconnu'
    const createdAt = record.created_at ?? new Date().toISOString()

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Celestin <onboarding@resend.dev>',
        to: [ALERT_EMAIL],
        subject: `🍷 Nouveau user Celestin !`,
        text: `Nouveau compte créé sur Celestin !\n\nEmail : ${email}\nDate : ${createdAt}\n\nhttps://supabase.com/dashboard/project/flqsprbdcycweshvrcyx/auth/users`,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Resend (${response.status}): ${error}`)
    }

    console.log(`[notify-signup] Alert sent for ${email}`)
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[notify-signup] Error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 200, // 200 to avoid webhook retries
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  }
})
