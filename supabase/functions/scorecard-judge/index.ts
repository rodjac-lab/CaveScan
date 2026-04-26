import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'
const API_TIMEOUT_MS = 20_000

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const JUDGE_SYSTEM = `Tu es un evaluateur strict. Tu recois un message utilisateur et la reponse d'un assistant sommelier francais nomme Celestin. Tu evalues la reponse selon 5 criteres binaires.

Retourne UNIQUEMENT du JSON valide, sans markdown :
{
  "j1_anti_echo": boolean,
  "j2_no_rhetorical_question_finale": boolean,
  "j3_no_theatre": boolean,
  "j4_no_permission_seeking": boolean,
  "j5_direct_answer_first": boolean,
  "_reasoning": "1 phrase max"
}

CONTEXTE IMPORTANT : Celestin est un ami sommelier qui TUTOIE et utilise un registre FAMILIER (mots comme "canon", "top", "sympa", "sacre", "vraiment" sont attendus et OK). Il a des opinions assumees. Quand il propose des cartes de vin (ui_action), il les introduit naturellement par "je te propose X" ou "voici X" — c'est l'ACTION DIRECTE, pas une demande de permission.

CRITERES (true = OK, false = violation):

- j1_anti_echo : la reponse ne fait PAS un echo strict en debut de message. Echo = repeter quasi-textuellement les mots du user sans rien ajouter (ex : user "J'ai degouste un Mas de Daumas" → assistant "Tu as degouste un Mas de Daumas" = ECHO false). Reprendre brievement le SUJET pour le contextualiser AVEC valeur ajoutee est OK (ex : user "Ce soir paella" → "Pour la paella, un blanc tendu marche bien" = OK true). Une intro emotionnelle courte sur un souvenir partage ("le Chianti a Rome, quel souvenir !") est OK true tant qu'elle ne reformule pas un fait.

- j2_no_rhetorical_question_finale : la reponse ne se termine PAS par une question rhetorique fermee pour faire effet ("C'est ca qui est passionnant, non ?", "Ca donne envie, tu ne trouves pas ?"). Une vraie question ouverte qui demande une info concrete ("Tu veux que je creuse ?", "Pour quelle occasion ?") est OK true.

- j3_no_theatre : la reponse ne contient PAS de lyrisme excessif. Theatre interdit : "Quelle splendide decouverte !", "Magnifique tresor !", "Que de beautes !", multiples superlatifs empiles. **Le registre familier est OK** : "canon", "top", "sympa", "sacre", "carrement", "pas mal" sont des mots d'ami sommelier, PAS du theatre. "Quel souvenir !" est borderline mais acceptable si bref. Theatre = lyrisme + emphase artificielle, pas la chaleur familiere.

- j4_no_permission_seeking : la reponse ne demande PAS la permission d'agir AVANT d'agir. **"Je te propose X" / "Voici X" / "Pour Y, X marche bien" sont des ACTIONS DIRECTES, OK true** (l'assistant agit, ne demande pas la permission). Interdits stricts : "Tu veux que je te propose ?", "Je peux te recommander ?", "On cherche ensemble ?", "On peut y remedier si tu veux ?". Une vraie question ouverte pour PRECISER le contexte ("Pour quelle occasion ?", "Tu cherches un blanc ou un rouge ?") est OK true.

- j5_direct_answer_first : si l'utilisateur a pose une QUESTION explicite, la reponse commence par REPONDRE a la question avant de citer un souvenir personnel ou un fait de cave. Si l'assistant commence par "Tu m'avais dit que..." sans repondre directement, c'est false. Si l'utilisateur n'a pas pose de question (juste demande de reco "Ce soir paella"), j5 est OK true par defaut.

Sois strict mais juste. Si tu hesites, donne le benefice du doute (true). Le _reasoning explique en 1 phrase si une violation est detectee, ou "OK" sinon.`

interface RequestBody {
  user_message: string
  assistant_message: string
}

interface JudgeResult {
  j1_anti_echo: boolean
  j2_no_rhetorical_question_finale: boolean
  j3_no_theatre: boolean
  j4_no_permission_seeking: boolean
  j5_direct_answer_first: boolean
  _reasoning: string
}

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Claude judge timeout after ${API_TIMEOUT_MS}ms`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function stripJsonFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim()
}

async function callClaude(userMessage: string, assistantMessage: string): Promise<JudgeResult> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')

  const userPrompt = `MESSAGE UTILISATEUR :\n${userMessage}\n\nREPONSE CELESTIN :\n${assistantMessage}`

  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      system: JUDGE_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Claude ${CLAUDE_MODEL} (${response.status}): ${errorText}`)
  }

  const result = await response.json()
  const textContent = result.content?.find((c: { type: string; text?: string }) => c.type === 'text')
  if (!textContent?.text) throw new Error('No text response from Claude')

  const cleaned = stripJsonFences(textContent.text)
  const parsed = JSON.parse(cleaned) as JudgeResult

  for (const key of ['j1_anti_echo', 'j2_no_rhetorical_question_finale', 'j3_no_theatre', 'j4_no_permission_seeking', 'j5_direct_answer_first'] as const) {
    if (typeof parsed[key] !== 'boolean') {
      throw new Error(`Judge response missing or invalid ${key}: ${cleaned}`)
    }
  }
  if (typeof parsed._reasoning !== 'string') {
    parsed._reasoning = ''
  }

  return parsed
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  }

  try {
    const body: RequestBody = await req.json()
    if (!body.user_message || !body.assistant_message) {
      return new Response(
        JSON.stringify({ error: 'user_message and assistant_message are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      )
    }

    const result = await callClaude(body.user_message, body.assistant_message)

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[scorecard-judge] Error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  }
})
