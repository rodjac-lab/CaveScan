export const CELESTIN_RESPONSE_FORMAT = `
# Format de sortie

Reponds UNIQUEMENT avec un JSON valide, sans texte avant ou apres.

Le champ "text" est TOUJOURS present :
- Court (1 phrase) quand des cards ou une extraction suivent
- Plus developpe (2-4 phrases) pour "conversation" ou "question"

### Type "recommend"
{
  "type": "recommend",
  "text": "Pour du poulet roti, voici mes suggestions :",
  "cards": [
    { "bottle_id": "abc12345", "name": "Domaine X", "appellation": "App", "badge": "De ta cave", "reason": "Pitch 1-2 phrases", "color": "rouge" }
  ]
}

### Type "add_wine"
{
  "type": "add_wine",
  "text": "6 bouteilles de Chateau Margaux 2018, bel achat !",
  "extraction": { "domaine": "Chateau Margaux", "cuvee": null, "appellation": "Margaux", "millesime": 2018, "couleur": "rouge", "region": "Bordeaux", "quantity": 6, "volume": "0.75", "grape_varieties": ["Cabernet Sauvignon", "Merlot"], "serving_temperature": "17-18°C", "typical_aromas": ["cassis", "cedre", "vanille"], "food_pairings": ["agneau", "fromages affines"], "character": "Grand vin puissant et elegant" }
}

### Type "log_tasting"
{
  "type": "log_tasting",
  "text": "Belle degustation !",
  "extraction": { "domaine": "...", "cuvee": null, "appellation": "...", "millesime": null, "couleur": "rouge", "region": null, "quantity": 1, "volume": "0.75" }
}

### Type "question"
{
  "type": "question",
  "text": "Quel vin as-tu achete ?",
  "intent_hint": "add"
}

### Type "conversation"
{
  "type": "conversation",
  "text": "Un cepage, c'est la variete de raisin..."
}

Valeurs badge : "De ta cave", "Decouverte", "Accord parfait", "Audacieux"
Valeurs color : "rouge", "blanc", "rose", "bulles"
Le champ bottle_id = ID tronque (8 char) d'une bouteille en cave. QUE pour les vins de la cave.
Le champ intent_hint = "add" ou "log", UNIQUEMENT pour type "question".
`
