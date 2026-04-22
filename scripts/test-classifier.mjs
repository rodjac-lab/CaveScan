// Test the classify-celestin-intent edge function against a corpus of queries.
// Usage: node scripts/test-classifier.mjs

const SUPABASE_URL = 'https://flqsprbdcycweshvrcyx.supabase.co'
const ANON_KEY = 'sb_publishable_LdEsLloN35xRFQ1auOpLIQ_x1PYZXZt'
const ENDPOINT = `${SUPABASE_URL}/functions/v1/classify-celestin-intent`
const TODAY = new Date().toISOString().slice(0, 10)

const AVAILABLE_COUNTRIES = ['France', 'Italie', 'Espagne', 'Allemagne', 'Portugal', 'Argentine', 'Chili', 'Etats-Unis']
const AVAILABLE_REGIONS = ['Bourgogne', 'Bordeaux', 'Val de Loire', 'Rhone', 'Alsace', 'Champagne', 'Jura', 'Languedoc', 'Toscane', 'Piemont', 'Rioja']
const AVAILABLE_APPELLATIONS = [
  'Marsannay', 'Chablis', 'Cote Rotie', 'Saint-Emilion', 'Saint-Estephe', 'Saint-Julien',
  'Morey-Saint-Denis', 'Nuits-Saint-Georges', 'Chambolle-Musigny', 'Gevrey-Chambertin',
  'Pouilly-Fume', 'Sancerre', 'Chinon', 'Vouvray', 'Brunello di Montalcino', 'Chianti Classico',
  'Barolo', 'Barbaresco', 'Rioja', 'Chateauneuf-du-Pape', 'Cornas', 'Crozes-Hermitage', 'Hermitage',
]
const AVAILABLE_DOMAINES = [
  'Domaine des Tours', 'Domaine Leflaive', 'Pierre Damoy', 'Henri Gouges', 'Coursodon',
  'Jean-Louis Chave', 'Clos de Tart', 'Sanlorenzo',
]

const QUERIES = [
  'mes meilleurs 2015',
  'accord pour un poulet roti',
  "qu'ai-je bu a Saint Genis Laval",
  'les vins italiens en mars',
  'mes vins bus avec Mederic',
  'combien de Brunello en cave',
  'ai-je deja bu du Barolo',
  'liste mes Chianti',
  'liste mes Chianti Classico',
  'liste mes Saint-Emilion',
  'liste mes Bordeaux',
  'que boire ce soir',
  'salut Celestin',
  'parle-moi du Savagnin',
  'hier',
  'ce week-end',
  'la semaine derniere',
  'en mars',
  'mes 3 plus mauvaises notes',
  'mes 5 meilleurs',
  'top 10 Bourgogne',
  'mes pires Bordeaux',
  "les vins de Bourgogne que j'ai bus",
  'au restaurant Le Meurice',
  'a Rome',
  'merci',
  'le 26 fevrier',
  'combien de bouteilles il me reste',
  'top Chianti',
  'explique-moi la difference entre Barolo et Barbaresco',
  'je cherche un rouge pour ce soir',
]

async function classify(query) {
  const body = {
    query,
    today: TODAY,
    availableCountries: AVAILABLE_COUNTRIES,
    availableRegions: AVAILABLE_REGIONS,
    availableAppellations: AVAILABLE_APPELLATIONS,
    availableDomaines: AVAILABLE_DOMAINES,
  }
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  try {
    return { status: res.status, data: JSON.parse(text) }
  } catch {
    return { status: res.status, raw: text }
  }
}

function formatLine(query, result) {
  if (result.raw) return `RAW ${result.status} ${result.raw.slice(0, 200)}`
  const d = result.data
  if (d.error) return `ERROR ${result.status}: ${d.error}`
  const facts = d.isFactual ? 'FACT' : '----'
  const intent = (d.intent ?? 'null').padEnd(12)
  const conf = typeof d.confidence === 'number' ? d.confidence.toFixed(2) : '?.??'
  const scope = (d.scope ?? 'null').padEnd(6)
  const filters = JSON.stringify(d.filters ?? {})
  const ranking =
    d.intent === 'ranking'
      ? ` rank=${d.rankingDirection ?? 'null'}/${d.rankingLimit ?? 'null'}`
      : ''
  const meta = d._meta ? `[${d._meta.provider} ${d._meta.latencyMs}ms]` : ''
  return `${facts} ${intent} ${scope} conf=${conf}${ranking} ${meta}\n       filters=${filters}`
}

async function main() {
  console.log(`Testing ${QUERIES.length} queries against ${ENDPOINT}\nToday: ${TODAY}\n`)
  for (const q of QUERIES) {
    const result = await classify(q)
    console.log(`> ${q}`)
    console.log(`  ${formatLine(q, result)}\n`)
  }
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
