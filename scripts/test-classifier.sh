#!/usr/bin/env bash
# Test the classify-celestin-intent edge function against a corpus of queries.
# Usage: ./scripts/test-classifier.sh

set -u

SUPABASE_URL="https://flqsprbdcycweshvrcyx.supabase.co"
ANON_KEY="sb_publishable_LdEsLloN35xRFQ1auOpLIQ_x1PYZXZt"
ENDPOINT="$SUPABASE_URL/functions/v1/classify-celestin-intent"
TODAY="$(date +%Y-%m-%d)"

# Approximate canonical lists (what the real wiring will pass from the user's cave)
AVAILABLE_COUNTRIES='["France","Italie","Espagne","Allemagne","Portugal","Argentine","Chili","Etats-Unis"]'
AVAILABLE_REGIONS='["Bourgogne","Bordeaux","Val de Loire","Rhone","Alsace","Champagne","Jura","Languedoc","Toscane","Piemont","Rioja"]'
AVAILABLE_APPELLATIONS='["Marsannay","Chablis","Cote Rotie","Saint-Emilion","Saint-Estephe","Saint-Julien","Morey-Saint-Denis","Nuits-Saint-Georges","Chambolle-Musigny","Gevrey-Chambertin","Pouilly-Fume","Sancerre","Chinon","Vouvray","Brunello di Montalcino","Chianti Classico","Barolo","Barbaresco","Rioja","Chateauneuf-du-Pape","Cornas","Crozes-Hermitage","Hermitage"]'
AVAILABLE_DOMAINES='["Domaine des Tours","Domaine Leflaive","Pierre Damoy","Henri Gouges","Coursodon","Jean-Louis Chave","Clos de Tart","Sanlorenzo"]'

QUERIES=(
  "mes meilleurs 2015"
  "accord pour un poulet roti"
  "qu'ai-je bu a Saint Genis Laval"
  "les vins italiens en mars"
  "mes vins bus avec Mederic"
  "combien de Brunello en cave"
  "ai-je deja bu du Barolo"
  "liste mes Chianti"
  "que boire ce soir"
  "salut Celestin"
  "parle-moi du Savagnin"
  "hier"
  "ce week-end"
  "la semaine derniere"
  "en mars"
  "mes 3 plus mauvaises notes"
  "les vins de Bourgogne que j'ai bus"
  "au restaurant Le Meurice"
  "a Rome"
  "merci"
  "le 26 fevrier"
  "combien de bouteilles il me reste"
  "top Chianti"
  "explique-moi la difference entre Barolo et Barbaresco"
  "je cherche un rouge pour ce soir"
)

for q in "${QUERIES[@]}"; do
  echo "─────────────────────────────────────────────────────────"
  echo "QUERY: $q"
  payload=$(jq -n \
    --arg query "$q" \
    --arg today "$TODAY" \
    --argjson countries "$AVAILABLE_COUNTRIES" \
    --argjson regions "$AVAILABLE_REGIONS" \
    --argjson appellations "$AVAILABLE_APPELLATIONS" \
    --argjson domaines "$AVAILABLE_DOMAINES" \
    '{query:$query, today:$today, availableCountries:$countries, availableRegions:$regions, availableAppellations:$appellations, availableDomaines:$domaines}')

  curl -sS -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ANON_KEY" \
    -H "apikey: $ANON_KEY" \
    -d "$payload" \
    | jq '.'
done
