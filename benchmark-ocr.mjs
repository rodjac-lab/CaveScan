import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

// === CONFIG ===
const PHOTOS_DIR = './Photo tests API'
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const SUPABASE_URL = 'https://flqsprbdcycweshvrcyx.supabase.co/functions/v1/extract-wine'
const SUPABASE_ANON_KEY = 'sb_publishable_LdEsLloN35xRFQ1auOpLIQ_x1PYZXZt'

const EXTRACTION_PROMPT = `Analyse cette photo d'étiquette de vin et extrais les informations suivantes au format JSON :

{
  "domaine": "nom du domaine/château/producteur",
  "cuvee": "nom de la cuvée si mentionné (ex: Orizeaux, Les Caillerets, Clos des Mouches...)",
  "appellation": "appellation d'origine (AOC/AOP/DOC/DOCG...)",
  "millesime": année (nombre entier ou null si non visible),
  "couleur": "rouge" | "blanc" | "rose" | "bulles",
  "region": "région viticole",
  "cepage": "cépage principal si mentionné",
  "confidence": 0.0-1.0
}

Si une information n'est pas visible sur l'étiquette, utilise null.
La cuvée est le nom spécifique du vin, distinct du domaine et de l'appellation. Par exemple pour "Chartogne Taillet Orizeaux Champagne", le domaine est "Chartogne Taillet", la cuvée est "Orizeaux", et l'appellation est "Champagne".
Pour la couleur, déduis-la de l'appellation si elle n'est pas explicite.
Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.`

// Multi-bottle variant
const EXTRACTION_PROMPT_MULTI = `Analyse cette photo contenant PLUSIEURS bouteilles de vin. Pour CHAQUE bouteille visible, extrais les informations au format JSON array :

[
  {
    "domaine": "nom du domaine/château/producteur",
    "cuvee": "nom de la cuvée si mentionné",
    "appellation": "appellation d'origine (AOC/AOP/DOC/DOCG...)",
    "millesime": année (nombre entier ou null si non visible),
    "couleur": "rouge" | "blanc" | "rose" | "bulles",
    "region": "région viticole",
    "cepage": "cépage principal si mentionné",
    "confidence": 0.0-1.0
  }
]

Si une information n'est pas visible sur l'étiquette, utilise null.
Pour la couleur, déduis-la de l'appellation si elle n'est pas explicite.
Réponds UNIQUEMENT avec le JSON array, sans texte avant ou après.`

// === PRICING (per 1M tokens) ===
const PRICING = {
  claude_haiku: { input: 0.80, output: 4.00, name: 'Claude Haiku 4.5' },
  gemini_flash: { input: 0.10, output: 0.40, name: 'Gemini 2.0 Flash' },
}

// Rough token estimates for vision tasks
const EST_INPUT_TOKENS = 1600  // ~image + prompt
const EST_OUTPUT_TOKENS = 200  // ~JSON response

function estimateCost(pricing) {
  const inputCost = (EST_INPUT_TOKENS / 1_000_000) * pricing.input
  const outputCost = (EST_OUTPUT_TOKENS / 1_000_000) * pricing.output
  return inputCost + outputCost
}

// === IMAGE RESIZE ===
const MAX_BASE64_BYTES = 4_800_000 // Stay under Anthropic's 5MB limit

async function getResizedBase64(filePath) {
  const raw = fs.readFileSync(filePath)
  let base64 = raw.toString('base64')

  if (base64.length > MAX_BASE64_BYTES) {
    // Resize to max 1600px wide, compress to 80% quality
    const resized = await sharp(raw)
      .resize(1600, null, { withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer()
    base64 = resized.toString('base64')
    console.log(`  ↳ Resized: ${(raw.length / 1024 / 1024).toFixed(1)}MB → ${(resized.length / 1024 / 1024).toFixed(1)}MB`)
  }

  return base64
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// === API CALLS ===

async function callClaude(imageBase64) {
  const start = Date.now()
  try {
    const res = await fetch(SUPABASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ image_base64: imageBase64 }),
    })
    const elapsed = Date.now() - start
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    return { result: data, time: elapsed, error: null }
  } catch (err) {
    return { result: null, time: Date.now() - start, error: err.message }
  }
}

async function callGemini(imageBase64, prompt) {
  const start = Date.now()
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
            { text: prompt },
          ],
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 1024 },
      }),
    })
    const elapsed = Date.now() - start
    const data = await res.json()

    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    // Strip markdown code blocks if present
    const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    const parsed = JSON.parse(cleaned)
    return { result: parsed, time: elapsed, error: null }
  } catch (err) {
    return { result: null, time: Date.now() - start, error: err.message }
  }
}

// === MAIN ===

async function run() {
  const files = fs.readdirSync(PHOTOS_DIR)
    .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .sort()

  console.log(`Found ${files.length} photos to test\n`)

  const results = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    console.log(`[${i + 1}/${files.length}] Processing ${file}...`)

    const filePath = path.join(PHOTOS_DIR, file)
    const imageBase64 = await getResizedBase64(filePath)

    // Call both APIs in parallel
    const [claude, gemini] = await Promise.all([
      callClaude(imageBase64),
      callGemini(imageBase64, EXTRACTION_PROMPT),
    ])

    // Delay to avoid Gemini rate limits (Tier 1)
    await sleep(5000)

    console.log(`  Claude: ${claude.time}ms ${claude.error ? '❌ ' + claude.error : '✅'}`)
    console.log(`  Gemini: ${gemini.time}ms ${gemini.error ? '❌ ' + gemini.error : '✅'}`)

    results.push({ file, claude, gemini })
  }

  // === GENERATE REPORT ===
  generateReport(results)
}

function escapeHtml(str) {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const COMPARE_FIELDS = ['domaine', 'cuvee', 'appellation', 'millesime', 'couleur', 'region', 'cepage']
const FIELD_LABELS = { domaine: 'Domaine', cuvee: 'Cuvée', appellation: 'Appellation', millesime: 'Millésime', couleur: 'Couleur', region: 'Région', cepage: 'Cépage', confidence: 'Confidence' }

function normalize(val) {
  if (val == null) return null
  return String(val).toLowerCase().trim()
}

function fieldsMatch(a, b) {
  return normalize(a) === normalize(b)
}

function compareResults(claudeData, geminiData) {
  if (!claudeData || !geminiData) return { fields: [], agreements: 0, disagreements: 0, totalCompared: 0 }

  // Handle arrays (multi-bottle) — compare first item only for simplicity
  const c = Array.isArray(claudeData) ? claudeData[0] : claudeData
  const g = Array.isArray(geminiData) ? geminiData[0] : geminiData

  const fields = []
  let agreements = 0
  let disagreements = 0

  for (const key of COMPARE_FIELDS) {
    const cVal = c?.[key] ?? null
    const gVal = g?.[key] ?? null
    const bothNull = cVal == null && gVal == null
    const match = fieldsMatch(cVal, gVal)

    if (!bothNull) {
      if (match) agreements++
      else disagreements++
    }

    fields.push({ key, label: FIELD_LABELS[key], claude: cVal, gemini: gVal, match, bothNull })
  }

  return { fields, agreements, disagreements, totalCompared: agreements + disagreements }
}

function formatFieldValue(val) {
  if (val == null) return '<span class="null">—</span>'
  return escapeHtml(String(val))
}

function formatComparedRow(field) {
  const cls = field.bothNull ? '' : field.match ? 'field-agree' : 'field-differ'
  return `<tr class="${cls}">
    <td class="field-label-cell">${field.label}</td>
    <td>${formatFieldValue(field.claude)}</td>
    <td>${formatFieldValue(field.gemini)}</td>
  </tr>`
}

function formatResultFallback(data, side) {
  if (!data) return '<em class="error">Erreur</em>'
  const d = Array.isArray(data) ? data[0] : data
  const extra = Array.isArray(data) && data.length > 1 ? `<p class="multi-note">+ ${data.length - 1} autre(s) bouteille(s) détectée(s)</p>` : ''
  const fields = [...COMPARE_FIELDS, 'confidence']
  return fields
    .map(key => {
      const val = d?.[key]
      const display = key === 'confidence' && val != null ? (val * 100).toFixed(0) + '%' : val
      return `<span class="field-label">${FIELD_LABELS[key]}:</span> ${display != null ? escapeHtml(String(display)) : '<span class="null">—</span>'}`
    })
    .join('<br>') + extra
}

function generateReport(results) {
  const claudeTimes = results.filter(r => !r.claude.error).map(r => r.claude.time)
  const geminiTimes = results.filter(r => !r.gemini.error).map(r => r.gemini.time)
  const claudeAvg = claudeTimes.length ? Math.round(claudeTimes.reduce((a, b) => a + b, 0) / claudeTimes.length) : 0
  const geminiAvg = geminiTimes.length ? Math.round(geminiTimes.reduce((a, b) => a + b, 0) / geminiTimes.length) : 0
  const claudeSuccesses = results.filter(r => !r.claude.error).length
  const geminiSuccesses = results.filter(r => !r.gemini.error).length
  const claudeCostPerCall = estimateCost(PRICING.claude_haiku)
  const geminiCostPerCall = estimateCost(PRICING.gemini_flash)

  // Compute comparisons for all results where both succeeded
  const comparisons = results.map(r => {
    if (r.claude.error || r.gemini.error) return null
    return compareResults(r.claude.result, r.gemini.result)
  })
  const validComparisons = comparisons.filter(Boolean)
  const totalAgreements = validComparisons.reduce((sum, c) => sum + c.agreements, 0)
  const totalDisagreements = validComparisons.reduce((sum, c) => sum + c.disagreements, 0)
  const totalCompared = totalAgreements + totalDisagreements
  const agreementRate = totalCompared > 0 ? Math.round((totalAgreements / totalCompared) * 100) : 0

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Benchmark OCR — Claude Haiku 4.5 vs Gemini 2.0 Flash</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #F7F4EF; --bg-card: #FFFFFF; --text-primary: #1A1A1A;
    --text-secondary: #6B6560; --text-muted: #A09A93; --accent: #B8860B;
    --border-color: #E8E3DA; --claude-color: #D97706; --gemini-color: #2563EB;
    --radius: 14px; --differ-bg: #FEF2F2; --agree-bg: #F0FDF4;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'DM Sans', system-ui, sans-serif; background: var(--bg); color: var(--text-primary); padding: 32px 16px; }
  .container { max-width: 1200px; margin: 0 auto; }
  h1 { font-family: 'Playfair Display', serif; font-size: 28px; text-align: center; margin-bottom: 4px; }
  .subtitle { text-align: center; color: var(--text-secondary); font-size: 14px; margin-bottom: 32px; }
  .brand { font-family: 'Playfair Display', serif; font-size: 11px; letter-spacing: 3px; color: var(--accent); text-align: center; margin-bottom: 8px; }

  .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .summary-card {
    background: var(--bg-card); border: 1px solid var(--border-color);
    border-radius: var(--radius); padding: 20px; text-align: center;
  }
  .summary-card .label { font-size: 11px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px; }
  .summary-card .value { font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 700; }
  .summary-card .detail { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
  .claude-accent { color: var(--claude-color); }
  .gemini-accent { color: var(--gemini-color); }
  .green-accent { color: #16a34a; }
  .red-accent { color: #dc2626; }
  .winner { background: linear-gradient(135deg, rgba(37,99,235,0.05), rgba(37,99,235,0.02)); border-color: var(--gemini-color); }
  .winner-claude { background: linear-gradient(135deg, rgba(217,119,6,0.05), rgba(217,119,6,0.02)); border-color: var(--claude-color); }

  .result-row {
    background: var(--bg-card); border: 1px solid var(--border-color);
    border-radius: var(--radius); margin-bottom: 16px; overflow: hidden;
  }
  .result-header {
    display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;
    padding: 14px 20px; border-bottom: 1px solid var(--border-color);
    background: rgba(0,0,0,0.01);
  }
  .result-filename { font-weight: 600; font-size: 13px; }
  .result-badges { display: flex; gap: 8px; font-size: 12px; align-items: center; }
  .time-badge { padding: 3px 10px; border-radius: 20px; font-weight: 500; }
  .time-claude { background: rgba(217,119,6,0.1); color: var(--claude-color); }
  .time-gemini { background: rgba(37,99,235,0.1); color: var(--gemini-color); }
  .diff-badge { padding: 3px 10px; border-radius: 20px; font-weight: 600; font-size: 11px; }
  .diff-badge-ok { background: #dcfce7; color: #16a34a; }
  .diff-badge-warn { background: #fef9c3; color: #a16207; }
  .diff-badge-bad { background: #fee2e2; color: #dc2626; }

  /* Comparison table */
  .compare-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .compare-table th {
    padding: 10px 16px; text-align: left; font-size: 10px; font-weight: 600;
    letter-spacing: 1.5px; text-transform: uppercase; border-bottom: 1px solid var(--border-color);
  }
  .compare-table th:nth-child(1) { color: var(--text-muted); width: 120px; }
  .compare-table th:nth-child(2) { color: var(--claude-color); }
  .compare-table th:nth-child(3) { color: var(--gemini-color); }
  .compare-table td { padding: 6px 16px; border-bottom: 1px solid rgba(0,0,0,0.03); }
  .compare-table tr:last-child td { border-bottom: none; }
  .field-label-cell { font-weight: 500; color: var(--text-secondary); }
  .field-agree { background: var(--agree-bg); }
  .field-differ { background: var(--differ-bg); }
  .field-differ td { font-weight: 600; }
  .null { color: var(--text-muted); font-style: italic; }
  .error { color: #dc2626; }
  .multi-note { margin-top: 6px; font-size: 11px; color: var(--accent); font-style: italic; }

  /* Fallback columns for when only one succeeded */
  .result-body-fallback { display: grid; grid-template-columns: 1fr 1fr; }
  .result-col { padding: 16px 20px; font-size: 12px; line-height: 1.8; }
  .result-col:first-child { border-right: 1px solid var(--border-color); }
  .col-header { font-size: 10px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 8px; }
  .col-claude .col-header { color: var(--claude-color); }
  .col-gemini .col-header { color: var(--gemini-color); }
  .field-label { font-weight: 500; color: var(--text-secondary); }

  .legend { display: flex; gap: 20px; justify-content: center; margin-bottom: 24px; font-size: 12px; color: var(--text-secondary); }
  .legend-item { display: flex; align-items: center; gap: 6px; }
  .legend-swatch { width: 14px; height: 14px; border-radius: 4px; border: 1px solid var(--border-color); }

  @media (max-width: 640px) {
    .result-body-fallback { grid-template-columns: 1fr; }
    .result-col:first-child { border-right: none; border-bottom: 1px solid var(--border-color); }
    .summary { grid-template-columns: 1fr 1fr; }
  }
</style>
</head>
<body>
<div class="container">
  <p class="brand">CAVESCAN</p>
  <h1>Benchmark OCR</h1>
  <p class="subtitle">Claude Haiku 4.5 vs Gemini 2.0 Flash — ${results.length} photos d'étiquettes</p>

  <div class="summary">
    <div class="summary-card ${claudeAvg <= geminiAvg ? 'winner-claude' : ''}">
      <div class="label">Temps moyen</div>
      <div class="value claude-accent">${claudeAvg}ms</div>
      <div class="detail">Claude Haiku 4.5</div>
    </div>
    <div class="summary-card ${geminiAvg <= claudeAvg ? 'winner' : ''}">
      <div class="label">Temps moyen</div>
      <div class="value gemini-accent">${geminiAvg}ms</div>
      <div class="detail">Gemini 2.0 Flash</div>
    </div>
    <div class="summary-card">
      <div class="label">Taux de succès</div>
      <div class="value"><span class="claude-accent">${claudeSuccesses}</span> / <span class="gemini-accent">${geminiSuccesses}</span></div>
      <div class="detail">Claude / Gemini sur ${results.length}</div>
    </div>
    <div class="summary-card">
      <div class="label">Accord</div>
      <div class="value ${agreementRate >= 80 ? 'green-accent' : 'red-accent'}">${agreementRate}%</div>
      <div class="detail">${totalAgreements} accords · ${totalDisagreements} différences</div>
    </div>
    <div class="summary-card">
      <div class="label">Coût estimé / scan</div>
      <div class="value" style="font-size:18px"><span class="claude-accent">$${claudeCostPerCall.toFixed(4)}</span> · <span class="gemini-accent">$${geminiCostPerCall.toFixed(4)}</span></div>
      <div class="detail">Claude · Gemini</div>
    </div>
  </div>

  <div class="legend">
    <div class="legend-item"><div class="legend-swatch" style="background:var(--agree-bg)"></div> Accord</div>
    <div class="legend-item"><div class="legend-swatch" style="background:var(--differ-bg)"></div> Différence — à vérifier</div>
  </div>

  ${results.map((r, i) => {
    const comp = comparisons[i]
    const bothOk = !r.claude.error && !r.gemini.error
    const diffCount = comp ? comp.disagreements : '?'
    const diffBadge = !bothOk ? '' :
      comp.disagreements === 0 ? '<span class="diff-badge diff-badge-ok">100% accord</span>' :
      comp.disagreements <= 2 ? `<span class="diff-badge diff-badge-warn">${comp.disagreements} diff</span>` :
      `<span class="diff-badge diff-badge-bad">${comp.disagreements} diff</span>`

    return `
  <div class="result-row">
    <div class="result-header">
      <div class="result-filename">${i + 1}. ${escapeHtml(r.file)}</div>
      <div class="result-badges">
        <span class="time-badge time-claude">${r.claude.error ? '❌' : r.claude.time + 'ms'}</span>
        <span class="time-badge time-gemini">${r.gemini.error ? '❌' : r.gemini.time + 'ms'}</span>
        ${diffBadge}
      </div>
    </div>
    ${bothOk && comp ? `
    <table class="compare-table">
      <thead><tr><th>Champ</th><th>Claude</th><th>Gemini</th></tr></thead>
      <tbody>
        ${comp.fields.map(f => formatComparedRow(f)).join('')}
      </tbody>
    </table>
    ` : `
    <div class="result-body-fallback">
      <div class="result-col col-claude">
        <div class="col-header">Claude Haiku 4.5</div>
        ${r.claude.error ? `<em class="error">${escapeHtml(r.claude.error)}</em>` : formatResultFallback(r.claude.result, 'claude')}
      </div>
      <div class="result-col col-gemini">
        <div class="col-header">Gemini 2.0 Flash</div>
        ${r.gemini.error ? `<em class="error">${escapeHtml(r.gemini.error)}</em>` : formatResultFallback(r.gemini.result, 'gemini')}
      </div>
    </div>
    `}
  </div>`
  }).join('')}

</div>
</body>
</html>`

  const outputPath = './benchmark-results.html'
  fs.writeFileSync(outputPath, html)
  console.log(`\n✅ Rapport généré: ${outputPath}`)
  console.log(`\n=== RÉSUMÉ ===`)
  console.log(`Claude Haiku 4.5: ${claudeSuccesses}/${results.length} succès, ${claudeAvg}ms moyen, ~$${claudeCostPerCall.toFixed(4)}/scan`)
  console.log(`Gemini 2.0 Flash: ${geminiSuccesses}/${results.length} succès, ${geminiAvg}ms moyen, ~$${geminiCostPerCall.toFixed(4)}/scan`)
  console.log(`Accord: ${agreementRate}% (${totalAgreements} accords, ${totalDisagreements} différences sur ${totalCompared} champs)`)
}

run().catch(console.error)
