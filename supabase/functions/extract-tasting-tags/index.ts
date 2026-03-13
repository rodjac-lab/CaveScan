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

interface TastingTags {
  plats: string[]
  descripteurs: string[]
  occasion: string | null
  sentiment: 'excellent' | 'bon' | 'moyen' | 'decevant' | null
  maturite: 'trop jeune' | 'en devenir' | 'a point' | 'passe son pic' | null
  keywords: string[]
}

interface RequestBody {
  tasting_note: string
  bottle_context: string
}

interface ProviderResult {
  provider: string
  tags: TastingTags
}

// === PROMPT ===

const EXTRACTION_PROMPT = `Tu es un expert en dégustation de vin. Tu extrais des tags structurés depuis des notes de dégustation.

Analyse la note ci-dessous et retourne un JSON :

{
  "plats": ["plat1", "plat2"],
  "descripteurs": ["descripteur1", "descripteur2"],
  "occasion": "description courte ou null",
  "sentiment": "excellent" | "bon" | "moyen" | "decevant" | null,
  "maturite": "trop jeune" | "en devenir" | "a point" | "passe son pic" | null,
  "keywords": ["mot-clé1", "mot-clé2"]
}

# Règles par champ

## plats
UNIQUEMENT les plats/aliments que l'utilisateur dit AVOIR MANGÉ avec le vin.
Ex: "servi avec un poulet rôti" → ["poulet rôti"]. "Sur un fromage" → ["fromage"].
RÈGLES STRICTES :
- Ne JAMAIS inventer de plats. Si la note ne mentionne pas explicitement ce qui a été mangé, laisser le tableau VIDE [].
- Ne JAMAIS suggérer des accords mets-vin. Ce champ capture des souvenirs réels, pas des recommandations.
- "Pomme au four", "poire", "cerise", "framboise", "kirsch", "chocolat", "lard fumé", "pâte à pain" = arômes du vin → vont dans descripteurs, PAS dans plats.
- Seul test : est-ce que l'utilisateur a RÉELLEMENT mangé cet aliment ? Si oui → plats. Si c'est un arôme ou une suggestion → NON.

## descripteurs
Tout ce qui décrit le vin : arômes (nez), saveurs (bouche), texture, structure.
Ex: "fruité", "tannique", "soyeux", "cerise noire", "minéral", "long", "boisé".
Inclure aussi les arômes de fruits, épices, fleurs même s'ils ressemblent à des aliments.

## occasion
Le contexte de dégustation s'il est mentionné.
Ex: "restaurant à Rome", "anniversaire de mariage", "apéro entre amis", "soirée vin", "au verre au restaurant".
Capturer le lieu, l'événement ou les personnes. null si rien n'est mentionné.

## sentiment
Déduis le sentiment GLOBAL, même pour les notes très courtes.
- "excellent" : enthousiasme marqué. Mots-signaux : "j'adore", "sublime", "superbe", "incroyable", "quel vin!", "exceptionnel", "grand vin", "coup de coeur", "magnifique", "extraordinaire".
- "bon" : positif sans enthousiasme excessif. Mots-signaux : "très bon", "bon", "c'était bien", "agréable", "plaisant", "sympa".
- "moyen" : mitigé ou déception modérée. Mots-signaux : "pas mal", "correct", "mitigé", "j'en attendais plus", "pas exceptionnel", "simple".
- "decevant" : clairement négatif. Mots-signaux : "mauvais", "déçu", "arf", "bof", "sans charme", "pas bon".
IMPORTANT : "vachement bon!" = bon. "J'adore" ou "sublime" = TOUJOURS excellent, même si la note est courte.
null UNIQUEMENT si la note est un test/placeholder sans aucun jugement.

## maturite
Évalue où en est le vin dans son évolution, INDÉPENDAMMENT du sentiment.
Un vin peut être excellent ET trop jeune. Un vin peut être décevant ET à point (il est juste pas bon).
- "trop jeune" : le vin n'est pas prêt, il a besoin de temps. Signaux : "pas prêt", "trop jeune", "fermé", "attendre", "besoin de temps", "austère", "tannins serrés".
- "en devenir" : le vin progresse, il sera meilleur plus tard mais déjà intéressant. Signaux : "s'ouvre", "en progression", "prometteur", "commence à se livrer", "jeune mais bon".
- "a point" : le vin est à son optimum ou dans une belle fenêtre. Signaux : "à boire", "à maturité", "prêt", "fondus", "épanoui", "sublime maintenant".
- "passe son pic" : le vin décline ou est passé. Signaux : "fatigué", "sur le retour", "passé", "trop vieux", "oxydé (en négatif)", "il fallait le boire avant".
null si la note ne donne AUCUNE indication sur l'évolution du vin.

## keywords
Expressions clés qui enrichissent le profil de l'utilisateur :
- Jugements comparatifs : "en dessous d'un Ramonet", "meilleur que le 2015"
- Conseil de garde/maturité : "à boire maintenant", "encore trop jeune", "à garder"
- Rapport qualité-prix : "bon rapport Q/P", "cher pour ce que c'est", "super valeur"
- Style/caractère : "vin de garde", "glou glou", "vin de gastronomie"
- Intention future : "à regoûter", "j'en rachète"
Ne PAS répéter le nom du domaine ou de l'appellation comme keyword.

# Notes courtes
Même une note d'un mot contient de l'information. "Superbe!" → sentiment excellent. "Arf" → sentiment decevant.
Ne laisse pas les champs vides si tu peux en déduire quelque chose du ton ou du contexte.

Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.`

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

function parseAndValidate(text: string): TastingTags {
  const jsonText = stripMarkdownCodeBlock(text)
  const data = JSON.parse(jsonText) as TastingTags
  return {
    plats: Array.isArray(data.plats) ? data.plats : [],
    descripteurs: Array.isArray(data.descripteurs) ? data.descripteurs : [],
    occasion: typeof data.occasion === 'string' ? data.occasion : null,
    sentiment: ['excellent', 'bon', 'moyen', 'decevant'].includes(data.sentiment as string)
      ? data.sentiment
      : null,
    maturite: ['trop jeune', 'en devenir', 'a point', 'passe son pic'].includes(data.maturite as string)
      ? data.maturite
      : null,
    keywords: Array.isArray(data.keywords) ? data.keywords : [],
  }
}

// === PROVIDERS ===

async function callGemini(userPrompt: string): Promise<ProviderResult> {
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
        maxOutputTokens: 500,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            plats: { type: 'ARRAY', items: { type: 'STRING' } },
            descripteurs: { type: 'ARRAY', items: { type: 'STRING' } },
            occasion: { type: 'STRING', nullable: true },
            sentiment: { type: 'STRING', nullable: true, enum: ['excellent', 'bon', 'moyen', 'decevant'] },
            maturite: { type: 'STRING', nullable: true, enum: ['trop jeune', 'en devenir', 'a point', 'passe son pic'] },
            keywords: { type: 'ARRAY', items: { type: 'STRING' } },
          },
          required: ['plats', 'descripteurs', 'occasion', 'sentiment', 'maturite', 'keywords'],
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

  const tags = parseAndValidate(text)
  return { provider: 'gemini/2.5-flash', tags }
}

async function callClaude(userPrompt: string): Promise<ProviderResult> {
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
      max_tokens: 500,
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

  const tags = parseAndValidate(textContent.text)
  return { provider: `claude/${CLAUDE_MODEL}`, tags }
}

// === FALLBACK ===

async function extractWithFallback(userPrompt: string): Promise<ProviderResult> {
  const providers: Array<{ name: string; call: () => Promise<ProviderResult> }> = []

  if (GEMINI_API_KEY) providers.push({ name: 'Gemini', call: () => callGemini(userPrompt) })
  if (ANTHROPIC_API_KEY) providers.push({ name: 'Claude', call: () => callClaude(userPrompt) })

  if (providers.length === 0) {
    throw new Error('No API keys configured. Set GEMINI_API_KEY and/or ANTHROPIC_API_KEY.')
  }

  const errors: string[] = []

  for (const provider of providers) {
    try {
      console.log(`[extract-tasting-tags] Trying ${provider.name}...`)
      const result = await provider.call()
      console.log(`[extract-tasting-tags] ${provider.name} succeeded`)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[extract-tasting-tags] ${provider.name} failed: ${message}`)
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

    if (!body.tasting_note || body.tasting_note.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'tasting_note is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      )
    }

    const userPrompt = `Note de dégustation : "${body.tasting_note}"
Contexte bouteille : ${body.bottle_context || 'Non spécifié'}`

    console.log(`[extract-tasting-tags] Processing note (${body.tasting_note.length} chars)`)

    const { provider, tags } = await extractWithFallback(userPrompt)
    console.log(`[extract-tasting-tags] Done by ${provider}`)

    return new Response(JSON.stringify(tags), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[extract-tasting-tags] Error:', message)

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }
})
