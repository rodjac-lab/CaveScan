import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// === CONFIG ===
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'
const API_TIMEOUT_MS = 15_000

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// === TYPES ===

interface ChatMessage {
  role: string
  content: string
}

interface RequestBody {
  messages: ChatMessage[]
  existing_facts?: string[]
}

interface ExtractedFact {
  category: 'preference' | 'aversion' | 'context' | 'life_event' | 'wine_knowledge' | 'social' | 'cellar_intent'
  fact: string
  confidence: number
  source_quote: string | null
  is_temporary: boolean
  expires_in_hours: number | null
}

interface ExtractionResult {
  facts: ExtractedFact[]
  summary: string
}

// === PROMPT ===

const EXTRACTION_PROMPT = `Tu es un assistant qui analyse des conversations entre un utilisateur et Celestin (sommelier IA).
Tu extrais les faits durables et generes un resume.

# Extraction de faits

Retourne un JSON avec deux champs : "facts" (tableau) et "summary" (string).

Chaque fact a :
- "category" : preference | aversion | context | life_event | wine_knowledge | social | cellar_intent
- "fact" : le fait en francais, concis (1 phrase max)
- "confidence" : 0.0 a 1.0 (certitude que c'est un vrai fait durable)
- "source_quote" : citation verbatim de l'utilisateur (pas de Celestin), ou null
- "is_temporary" : true si c'est du contexte ephemere (repas ce soir, invites demain)
- "expires_in_hours" : si is_temporary=true, nombre d'heures avant expiration (ex: 12 pour "ce soir")

# Categories

- preference : ce que l'utilisateur aime (regions, cepages, styles, accords)
- aversion : ce qu'il n'aime pas ou evite
- context : situation ephemere (repas prevu, invites, budget du moment)
- life_event : evenements de vie lies au vin (anniversaire, voyage, decouverte marquante)
- wine_knowledge : connaissances vin de l'utilisateur (niveau, domaines connus)
  Inclut aussi sa maniere d'apprendre si elle est explicite
- social : entourage (qui boit quoi, preferences des proches)
- cellar_intent : intentions d'achat ou de gestion de cave

# Regles strictes

- N'extrais QUE ce que dit l'UTILISATEUR, pas les recommandations de Celestin
- Pour tout fait durable, fournis une source_quote tiree mot pour mot d'un message utilisateur. Si tu ne peux pas citer l'utilisateur, n'extrais pas le fait.
- Ne deduis PAS des preferences evidentes (s'il a 80% de rouge en cave, n'ecris pas "aime le rouge")
- DISTINGUE observation et preference : "gouter jeune permet de connaitre le style" = observation (wine_knowledge), PAS "aime les vins jeunes" (preference). Une preference c'est un jugement de gout explicite ("j'adore", "c'etait un regal", "je n'aime pas").
- Capture aussi les meta-preferences explicites de conversation et d'apprentissage :
  "explique-moi simplement", "j'aime comparer", "pas trop technique", "guide-moi" -> wine_knowledge
- Si un fait contredit un fait existant, extrais le nouveau (la supersedure sera geree cote app)
- N'extrais PAS les plaisanteries, salutations, remerciements
- Prefere la precision : "aime les Chenin de Loire" plutot que "aime le vin blanc"
- Capture les REACTIONS EMOTIONNELLES fortes : "un bonbon", "un regal", "sublime", "decevant" → ce sont des preferences durables a extraire absolument, avec le vin concerne
- NE transforme PAS un choix ponctuel de tour en preference durable. Exemples a ne pas extraire comme preference stable :
  "plutot un rouge", "plutot un blanc", "ce soir poulet roti", "je cherche un vin italien", "ce soir j'ai envie de..."
- Les questions de culture vin ponctuelles ("difference entre Barolo et Barbaresco", "ai-je deja bu du Barolo ?") ne sont PAS des facts wine_knowledge durables, sauf si l'utilisateur exprime explicitement sa maniere d'apprendre ("explique-moi simplement", "j'aime comparer", "pas trop technique").
- Si la conversation est triviale (bonjour, merci, question simple), retourne facts: [] et summary quand meme

# Resume

Le "summary" est UNE phrase qui resume seulement ce qui merite de rester memorisable d'une session.
Ex: "Discussion accords pour osso bucco, recommande Cornas et Crozes-Hermitage"
Ex: "Ajout de 3 Bourgognes achetes chez Lavinia"
Ex: "Question sur le chenin et les vins de Loire"

Si la conversation est surtout un test, une recommandation ponctuelle pour ce soir, ou une simple question de culture vin sans information durable sur l'utilisateur, retourne summary: "".

Reponds UNIQUEMENT avec le JSON.`

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

function parseAndValidate(text: string): ExtractionResult {
  const jsonText = stripMarkdownCodeBlock(text)
  const data = JSON.parse(jsonText)

  const validCategories = ['preference', 'aversion', 'context', 'life_event', 'wine_knowledge', 'social', 'cellar_intent']

  const facts: ExtractedFact[] = Array.isArray(data.facts)
    ? data.facts
        .filter((f: Record<string, unknown>) =>
          typeof f.fact === 'string' && f.fact.length > 0 && validCategories.includes(f.category as string))
        .map((f: Record<string, unknown>) => ({
          category: f.category as ExtractedFact['category'],
          fact: (f.fact as string).slice(0, 500),
          confidence: typeof f.confidence === 'number' ? Math.min(1, Math.max(0, f.confidence)) : 0.8,
          source_quote: typeof f.source_quote === 'string' ? f.source_quote.slice(0, 300) : null,
          is_temporary: f.is_temporary === true,
          expires_in_hours: typeof f.expires_in_hours === 'number' ? f.expires_in_hours : null,
        }))
    : []

  const summary = typeof data.summary === 'string' ? data.summary.slice(0, 500) : ''

  return { facts, summary }
}

// === PROVIDERS ===

async function callGemini(userPrompt: string): Promise<ExtractionResult> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: EXTRACTION_PROMPT }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1200,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            facts: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  category: { type: 'STRING', enum: ['preference', 'aversion', 'context', 'life_event', 'wine_knowledge', 'social', 'cellar_intent'] },
                  fact: { type: 'STRING' },
                  confidence: { type: 'NUMBER' },
                  source_quote: { type: 'STRING', nullable: true },
                  is_temporary: { type: 'BOOLEAN' },
                  expires_in_hours: { type: 'NUMBER', nullable: true },
                },
                required: ['category', 'fact', 'confidence', 'is_temporary'],
              },
            },
            summary: { type: 'STRING' },
          },
          required: ['facts', 'summary'],
        },
      },
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

async function callClaude(userPrompt: string): Promise<ExtractionResult> {
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
      max_tokens: 1200,
      system: EXTRACTION_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
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

async function extractWithFallback(userPrompt: string): Promise<ExtractionResult> {
  const providers: Array<{ name: string; call: () => Promise<ExtractionResult> }> = []

  if (GEMINI_API_KEY) providers.push({ name: 'Gemini', call: () => callGemini(userPrompt) })
  if (ANTHROPIC_API_KEY) providers.push({ name: 'Claude', call: () => callClaude(userPrompt) })

  if (providers.length === 0) {
    throw new Error('No API keys configured.')
  }

  const errors: string[] = []

  for (const provider of providers) {
    try {
      console.log(`[extract-chat-insights] Trying ${provider.name}...`)
      const result = await provider.call()
      console.log(`[extract-chat-insights] ${provider.name} succeeded — ${result.facts.length} facts, summary: "${result.summary.slice(0, 60)}"`)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[extract-chat-insights] ${provider.name} failed: ${message}`)
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
    const body: RequestBody = await req.json()

    if (!body.messages || body.messages.length < 2) {
      return new Response(
        JSON.stringify({ error: 'At least 2 messages required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      )
    }

    // Build conversation text for the LLM
    const conversationLines = body.messages.map(m => {
      const label = m.role === 'user' ? 'Utilisateur' : 'Celestin'
      return `${label} : ${m.content.slice(0, 500)}`
    })

    let userPrompt = `Conversation a analyser :\n\n${conversationLines.join('\n')}`

    if (body.existing_facts && body.existing_facts.length > 0) {
      userPrompt += `\n\nFaits deja connus (ne pas re-extraire sauf si contredits) :\n${body.existing_facts.map(f => `- ${f}`).join('\n')}`
    }

    console.log(`[extract-chat-insights] Processing ${body.messages.length} messages`)

    const result = await extractWithFallback(userPrompt)

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[extract-chat-insights] Error:', message)

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }
})
