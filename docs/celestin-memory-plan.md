# Mémoire Celestin

## Vision

Celestin ne doit pas "se souvenir" tout seul. Le LLM raisonne sur une mémoire externe organisée en 4 couches :

1. **Faits** (DB) — cave, dégustations, achats, tags, préférences explicites
2. **Profil inféré** (calculé) — goûts déduits, sensibilité prix, styles aimés, préférences saisonnières
3. **Souvenirs** (semantic search) — notes de dégustation, accords réussis, moments marquants
4. **État conversationnel** (runtime) — sujet courant, shortlist active, contraintes, objectif du tour

Le LLM ne doit pas être la mémoire. Le LLM doit être le cerveau qui raisonne sur une mémoire externe bien organisée.

## Plan

### V1 (quasi terminée)

Objectif : rendre Celestin nettement meilleur sans changer toute l'architecture.

Ce qu'on met en place :
- Garder la cave complète condensée
- Améliorer le user_taste_profile
- Mieux structurer les préférences explicites
- Mieux extraire les tags de dégustation
- Stocker quelques souvenirs "forts" en base
- Améliorer la sélection dynamique des souvenirs selon la question
- Ajouter un vrai état conversationnel court

Concrètement :
- Tables solides pour : bottles, tastings, user_taste_profiles, user_preferences, conversation_state, memory_snippets
- Celestin reçoit : cave condensée, profil synthétique, 3 à 5 souvenirs pertinents, état de conversation actif

### V2 (implémentée mars 2026)

Objectif : donner à Celestin une vraie mémoire récupérable, pas seulement des résumés.

**Implémentation réalisée :**
- **pgvector** extension + colonne `embedding vector(1536)` sur `bottles`
- **OpenAI text-embedding-3-small** via edge function `generate-embedding/` (2 modes : query et save)
- **Texte composite** embeddé : identité vin + origine + note + tags structurés + character
- **RPC `search_memories()`** : score hybride (cosine similarity × 0.6 + rating/sentiment/recency × 0.4)
- **`selectRelevantMemoriesAsync()`** : try semantic search → fallback keyword matching (zero risque)
- **Hook fire-and-forget** : embedding généré automatiquement à chaque sauvegarde de note de dégustation
- **Backfill** via Debug.tsx (44 bouteilles, 0 erreurs)

### Détails techniques implémentés

#### selectRelevantMemories() — scoring keyword

| Mode | Plats | Descripteurs | Keywords |
|------|-------|-------------|----------|
| food | ×4 | — | ×2 |
| wine | — | ×4 | ×2 |
| generic | ×3 | ×3 | ×2 |

Bonus additionnels :
- **Identity match** (domaine/appellation/cuvée) : +5 par mot
- **Tasting note text match** : +2 par mot
- **Sentiment** : excellent +3, bon +1
- **Rating** : ≥4★ +1.5, 5★ +1.0 (cumulatif)
- **Recency** : <30j +1.5, <90j +0.8, <180j +0.3
- **Sans query** : retourne top-scored proactivement (meilleurs notés, plus récents)

#### searchSemanticMemories() — params

- `similarity_threshold` : 0.3
- `match_count` par défaut : 7
- Fallback : si query < 3 chars → keyword direct

#### buildCompositeText() — contenu embeddé

```
domaine | cuvee | appellation | millesime | couleur
country, region
Note: "tasting note"
Plats: plat1, plat2
Occasion: occasion
Sentiment: excellent/bon
Descripteurs: desc1, desc2
Keywords: kw1, kw2
Caractère: character field
```

#### rankCaveBottles() — formule de scoring

Basé sur `src/lib/recommendationRanking.ts`.

Composantes du score :
1. **Color weight** (mode + query dépendant) :
   - Food mode : poisson/fruits de mer → blanc/rosé/bulles +2, rouge -2 ; viande rouge → rouge +2 ; etc.
   - Wine mode : couleur mentionnée dans la query → +3
2. **Profile affinity** (max ~2.8) : top appellation +2 décroissant (-0.15×index), top domaine idem, distribution couleur
3. **Recency penalty** : bouteille exacte bue récemment → -4, même domaine+appellation → -2.5
4. **Query match** : tokens dans domaine/cuvée/appellation/notes → +0.8/token, cap 2.5
5. **Generic mode uniquement :**
   - Temporal : été blanc/rosé/bulles +0.8, hiver rouge +0.8, weekend bulles +0.5
   - Maturity window : dans fenêtre +1.0, avant drink_from -1.2, après drink_until -0.6
   - Value : prix > avg×1.35 en semaine → -0.4, prix ≤ avg×0.85 → +0.35
   - Exploration : couleur ≤10% distribution → +0.45

**Ce qui reste du plan V2 original (non implémenté) :**
- Journal d'événements utilisateur (memory_events)
- Embeddings sur conversations (pas seulement dégustations)
- Distinction nette préférences stables vs tendances récentes vs souvenirs marquants
- Retrieval par intention (question cave / recommandation / souvenir / comparaison)

Résultat obtenu :
- "vin italien de Noël" retrouve un Brunello dégusté en décembre
- "qu'est-ce qu'on avait bu avec l'osso bucco" retrouve le bon accord
- fallback transparent si l'embedding échoue

### V3

Objectif : niveau best-in-class.

Ce qu'on ajoute :
- Feature store complet
- Profils recalculés en continu
- Segmentation fine des goûts
- Mémoire multi-horizon (court/moyen/long terme)
- Apprentissage sur feedback implicite
- Orchestration mémoire avancée avant chaque appel LLM
- Éventuellement modèles spécialisés pour : scoring des préférences, importance des souvenirs, détection de changement de goût

Concrètement :
- Stack complète : DB transactionnelle, feature store, vector store, conversation state store, orchestrateur mémoire
- Celestin reçoit un contexte assemblé sur mesure à chaque tour

## Avancement V1 (mars 2026)

V1 quasi terminée. Voici ce qui a été implémenté et validé :

### Fait
- **Profil de goût enrichi** : agrégation des tasting_tags (plats vécus, descripteurs récurrents, occasions typiques) dans ComputedTasteProfile, sérialisé dans le prompt Celestin
- **Souvenirs proactifs** : quand aucun souvenir ne matche la question par mot-clé, fallback sur les souvenirs les mieux notés / plus récents / sentiment fort — permet à Celestin de citer spontanément de bonnes expériences
- **Historique conversationnel enrichi** : les cards de recommandation et les fiches vin (encavage/dégustation) sont résumées dans l'historique envoyé au LLM, pour que Celestin comprenne "le deuxième" ou "celui de droite"
- **Mémoire cross-session** : les derniers échanges sont sauvés dans localStorage, puis injectés comme contexte lors de la session suivante (rotation automatique, TTL 7 jours)
- **Prompt relationship** mis à jour pour guider l'utilisation des plats vécus, descripteurs, et de la session précédente

### Reste à faire (non fondamental)
- **Préférences explicites (UI)** : le type `ExplicitPreferences` existe (régions aimées/évitées, accords custom, notes libres) et est déjà sérialisé dans le prompt, mais il n'y a aucun écran pour que l'utilisateur les renseigne. Nécessite une UI dans les Réglages. Non bloquant — les données vécues (tasting tags) couvrent déjà l'essentiel.
- **Migration mémoire cross-session localStorage → Supabase** : le prototype localStorage fonctionne mais ne survit pas à un changement de device ou un clear du navigateur. Migrer vers une table Supabase rendrait la mémoire cross-session persistante et multi-device. Non bloquant — la valeur est déjà là avec localStorage.

## Recommandation

- V1 quasi terminée — valider en usage réel avant d'aller plus loin
- V2 implémentée — semantic search + keyword fallback opérationnels
- V3 seulement si on veut construire un vrai moat produit autour de la mémoire utilisateur

En une phrase :
- V1 = bon sommelier personnalisé (quasi fait)
- V2 = sommelier avec mémoire réelle (fait)
- V3 = assistant best-in-class qui connaît l'utilisateur presque par cœur
