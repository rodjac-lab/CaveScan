import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// === CONFIG ===
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'
const API_TIMEOUT_MS = 15_000

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// === TYPES ===

interface ConversationTurn {
  role: 'user' | 'assistant'
  text: string
}

interface AssistantRequest {
  message: string
  history: ConversationTurn[]
  intent: 'encaver' | 'deguster'
}

interface AssistantExtraction {
  domaine: string | null
  cuvee: string | null
  appellation: string | null
  millesime: number | null
  couleur: 'rouge' | 'blanc' | 'rose' | 'bulles' | null
  region: string | null
  quantity: number
  volume: '0.375' | '0.75' | '1.5'
  grape_varieties?: string[] | null
  serving_temperature?: string | null
  typical_aromas?: string[] | null
  food_pairings?: string[] | null
  character?: string | null
}

interface AssistantResponse {
  type: 'extraction' | 'question'
  extraction?: AssistantExtraction
  question?: string
  summary?: string
}

// === UTILS ===

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${API_TIMEOUT_MS / 1000}s`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function stripMarkdownCodeBlock(text: string): string {
  let result = text.trim()
  if (result.startsWith('```')) {
    result = result.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }
  return result
}

function parseAndValidate(text: string): AssistantResponse {
  const jsonText = stripMarkdownCodeBlock(text)
  const data = JSON.parse(jsonText) as AssistantResponse
  if (!data.type || (data.type !== 'extraction' && data.type !== 'question')) {
    throw new Error('Invalid response: missing or invalid "type" field')
  }
  return data
}

// === PROMPT ===

function buildSystemPrompt(intent: 'encaver' | 'deguster'): string {
  const intentLabel = intent === 'encaver' ? 'ENCAVER (ajouter en cave)' : 'DEGUSTER (enregistrer une degustation)'

  return `Tu es Celestin, un assistant vin personnel. L'utilisateur veut ${intentLabel} une ou plusieurs bouteilles.

## Ta personnalite
- Tu tutoies l'utilisateur
- Tu es chaleureux, passionne, enthousiaste mais concis
- Tu utilises un ton conversationnel naturel

## Ta mission
Extraire les informations du vin a partir du message en langage naturel.

## Vocabulaire volume
- "demi-bouteille", "demi", "demie", "37.5cl", "375ml" = volume "0.375"
- "bouteille", "btl", "75cl", "750ml" (ou rien de specifie) = volume "0.75"
- "magnum", "mag", "1.5L", "150cl" = volume "1.5"

## Regles ABSOLUES pour la couleur
- Champagne, Cremant, Cava, Prosecco, methode traditionnelle, mousseux, petillant = TOUJOURS "bulles"
- Rose, clairet = "rose"
- Ne confonds JAMAIS un vin effervescent avec un blanc. "bulles" est une categorie a part.

## Logique
1. Analyse le message et l'historique de conversation
2. Si tu as assez d'infos pour identifier le vin → reponds avec type "extraction"
3. Si des infos critiques manquent → reponds avec type "question"

### Infos critiques (demander si absentes) :
- Le nom du vin ou du domaine (au minimum un des deux : domaine ou appellation)
- La quantite (si pas mentionnee, suppose 1)
- Le format (si pas mentionne, suppose bouteille 0.75L)

### Infos facultatives (ne PAS demander, deduire ou laisser null) :
- millesime (null si pas mentionne)
- couleur (deduire du type de vin si possible, ex: Champagne = bulles, Margaux = rouge)
- cuvee, region, cepage

## Enrichissement
Quand tu fais une extraction, enrichis avec tes connaissances oenologiques :
- grape_varieties : cepages typiques de l'appellation
- serving_temperature : temperature de service conseillee
- typical_aromas : 3-5 aromes typiques
- food_pairings : 3-4 accords mets
- character : description en 1 phrase du style du vin

${intent === 'deguster' ? `## Mode degustation
Si l'utilisateur mentionne son ressenti (super, decevant, incroyable...), note-le dans le summary.` : ''}

## Format de sortie
Reponds UNIQUEMENT avec un JSON valide, sans texte avant ou apres :

Pour une extraction reussie :
{
  "type": "extraction",
  "extraction": {
    "domaine": "Nom du domaine ou null",
    "cuvee": "Nom de la cuvee ou null",
    "appellation": "Appellation ou null",
    "millesime": 2020,
    "couleur": "rouge",
    "region": "Region ou null",
    "quantity": 6,
    "volume": "0.75",
    "grape_varieties": ["Cabernet Sauvignon", "Merlot"],
    "serving_temperature": "16-18°C",
    "typical_aromas": ["cassis", "cedre", "vanille"],
    "food_pairings": ["agneau", "fromages affines"],
    "character": "Vin puissant et structure, aux tanins soyeux"
  },
  "summary": "6 bouteilles de Domaine X Appellation 2020"
}

Pour une question de suivi :
{
  "type": "question",
  "question": "Combien de bouteilles as-tu achetees ?"
}`
}

function buildMessages(body: AssistantRequest): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = []

  // Add conversation history
  for (const turn of body.history) {
    messages.push({
      role: turn.role === 'user' ? 'user' : 'assistant',
      content: turn.text,
    })
  }

  // Add current message
  messages.push({ role: 'user', content: body.message })

  return messages
}

// === PROVIDERS ===

async function callGemini(systemPrompt: string, messages: Array<{ role: string; content: string }>): Promise<AssistantResponse> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`

  // Gemini uses a different format for multi-turn
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.2, maxOutputTokens: 1500 },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    let message = errorText
    try {
      const parsed = JSON.parse(errorText)
      message = parsed.error?.message || errorText
    } catch { /* use raw text */ }
    throw new Error(`Gemini 2.5 Flash (${response.status}): ${message}`)
  }

  const result = await response.json()
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('No text response from Gemini')

  return parseAndValidate(text)
}

async function callClaude(systemPrompt: string, messages: Array<{ role: string; content: string }>): Promise<AssistantResponse> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')

  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      messages,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    let message = errorText
    try {
      const parsed = JSON.parse(errorText)
      message = parsed.error?.message || errorText
    } catch { /* use raw text */ }
    throw new Error(`Claude ${CLAUDE_MODEL} (${response.status}): ${message}`)
  }

  const result = await response.json()
  const textContent = result.content?.find((c: { type: string; text?: string }) => c.type === 'text')
  if (!textContent?.text) throw new Error('No text response from Claude')

  return parseAndValidate(textContent.text)
}

// === FALLBACK ===

async function assistantWithFallback(systemPrompt: string, messages: Array<{ role: string; content: string }>): Promise<{ provider: string; response: AssistantResponse }> {
  const providers: Array<{ name: string; call: () => Promise<AssistantResponse> }> = []

  if (GEMINI_API_KEY) providers.push({ name: 'Gemini', call: () => callGemini(systemPrompt, messages) })
  if (ANTHROPIC_API_KEY) providers.push({ name: 'Claude', call: () => callClaude(systemPrompt, messages) })

  if (providers.length === 0) {
    throw new Error('No API keys configured.')
  }

  const errors: string[] = []

  for (const provider of providers) {
    try {
      console.log(`[celestin-assistant] Trying ${provider.name}...`)
      const response = await provider.call()
      console.log(`[celestin-assistant] ${provider.name} succeeded: type=${response.type}`)
      return { provider: provider.name, response }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[celestin-assistant] ${provider.name} failed: ${message}`)
      errors.push(message)
    }
  }

  throw new Error(`All providers failed. ${errors.join(' | ')}`)
}

// === MAIN HANDLER ===

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const body: AssistantRequest = await req.json()
    console.log(`[celestin-assistant] intent=${body.intent} message="${body.message}" history=${body.history.length} turns`)

    const systemPrompt = buildSystemPrompt(body.intent)
    const messages = buildMessages(body)

    const { provider, response } = await assistantWithFallback(systemPrompt, messages)
    console.log(`[celestin-assistant] Done by ${provider}`)

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[celestin-assistant] Error:', message)

    return new Response(
      JSON.stringify({
        type: 'question',
        question: "Desole, je n'ai pas bien compris. Peux-tu reformuler ?",
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }
})
