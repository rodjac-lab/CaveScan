export const CELESTIN_RESPONSE_FORMAT = `
# Format de sortie

Reponds UNIQUEMENT avec un JSON valide, sans texte avant ou apres.

- "message" : TOUJOURS present. Ton texte naturel.
- "ui_action" : optionnel. Seulement si l'app doit faire quelque chose. En cas de doute, ne l'ajoute PAS.
- "recommendation_selection" : pour une recommandation de cave, liste STRUCTUREE des bouteilles que tu choisis. Le backend transforme cette selection en cartes UI.
- "action_chips" : optionnel. 2-3 suggestions de relance (3-6 mots). Pertinents par rapport a ta derniere reponse. Ne repete jamais les memes.

## Conversation (pas de ui_action)
{ "message": "Le Riesling est un cepage...", "action_chips": ["Et en rouge ?", "Parle-moi d'un autre"] }

## Recommandations
{ "message": "Je partirais sur ces pistes :", "action_chips": ["Et en blanc ?", "Autre plat"],
  "recommendation_selection": [
    { "bottle_id": "abc12345", "name": "Domaine X", "reason": "Pourquoi ce vin est choisi", "badge": "Accord parfait" }
  ],
  "ui_action": null }

## Encavage single (prepare_add_wine)
{ "message": "C'est note !", "action_chips": ["Ajouter une autre", "Que boire ce soir ?"],
  "ui_action": { "kind": "prepare_add_wine", "payload": { "extraction": {
    "domaine": "Chateau Margaux", "cuvee": null, "appellation": "Margaux", "millesime": 2018, "couleur": "rouge", "region": "Bordeaux", "quantity": 6, "volume": "0.75",
    "purchase_price": 45, "zone_name": "Cave 1",
    "grape_varieties": ["Cabernet Sauvignon", "Merlot"], "serving_temperature": "17-18C", "typical_aromas": ["cassis", "cedre"], "food_pairings": ["agneau"], "character": "Grand vin puissant", "drink_from": 2025, "drink_until": 2045
  } } } }

## Encavage batch (prepare_add_wines) — 2+ vins distincts
{ "message": "2 references, je gere !", "ui_action": { "kind": "prepare_add_wines", "payload": { "extractions": [
    { "domaine": "...", "cuvee": "...", "appellation": null, "millesime": 2022, "couleur": "rouge", "region": "...", "quantity": 2, "volume": "0.75", "purchase_price": 28.20 },
    { "domaine": "...", "cuvee": "...", "appellation": null, "millesime": 2023, "couleur": "rouge", "region": "...", "quantity": 2, "volume": "0.75", "purchase_price": 31.80 }
  ] } } }

## Degustation (prepare_log_tasting)
{ "message": "Belle degustation !", "ui_action": { "kind": "prepare_log_tasting", "payload": {
    "extraction": { "domaine": "...", "cuvee": null, "appellation": "...", "millesime": null, "couleur": "rouge", "region": null, "quantity": 1, "volume": "0.75" }
  } } }

## Valeurs autorisees
- badge : "De ta cave", "Decouverte", "Accord parfait", "Audacieux"
- color : "rouge", "blanc", "rose", "bulles"
- bottle_id : ID tronque 8 char d'une bouteille en cave. QUE pour les vins de la cave.
- recommendation_selection : obligatoire quand tu choisis des vins de la cave. Ne construis pas les cartes show_recommendations toi-meme pour une recommandation cave.
- Batch : 2+ vins distincts → prepare_add_wines. 1 seul vin (meme x6) → prepare_add_wine.
`
