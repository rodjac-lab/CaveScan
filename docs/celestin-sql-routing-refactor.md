# Refonte du routage SQL Celestin — livrée

**Date de décision** : 2026-04-22
**Date de livraison** : 2026-04-22 (classifier + wiring) / 2026-04-23 (nettoyage regex + simplify + quick wins)
**Statut** : ✅ **LIVRÉ EN PROD**

## TL;DR

Le routage SQL factuel Celestin (tâche #2 du chantier mémoire) est en production, piloté par un classifier LLM dédié au lieu des regex substring qui produisaient des faux positifs (Marsannay/mars, Val de Loire/laval, Saint-* / "Saint Genis Laval", Côte Rôtie / "poulet rôti"). Ce document garde sa valeur de post-mortem — lire `celestin-architecture.md` pour le flow runtime actuel.

### Ce qui a été livré

- **Edge function `classify-celestin-intent`** (déployée). Gemini 2.5 Flash Lite primaire + GPT-4.1 mini fallback. JSON schema strict. Retourne `{ isFactual, intent, filters, scope, rankingDirection, rankingLimit, confidence }`.
- **Module client `src/lib/celestinIntentClassifier.ts`** : appel edge function + collecte des listes canoniques (countries/regions/appellations/domaines) depuis la cave.
- **Pre-filter `src/lib/celestinIntentPreFilter.ts`** : court-circuit ultra-restrictif sur ~40 messages triviaux ("merci", "ok", "salut"…) pour éviter l'appel LLM.
- **Dispatcher `routeFactualQueryFromClassification`** dans `src/lib/sqlRetrievalRouter.ts` : traduit le JSON classifier en blocs SQL via 5 builders (temporal/geographic/quantitative/ranking/inventory).
- **Wiring dans `celestinChatRequest.ts`** : `Promise.all(classifier + memoryEvidence + profil)` en parallèle.
- **Cache module-level du profil compilé** + pre-warm au montage chat.

### Performance mesurée

- Triviaux ("merci", "ok") : ~2s total
- Questions factuelles normales : ~3-3.5s total, dont ~2-2.5s incompressibles côté LLM principal Celestin
- Classifier : ~900ms (Flash Lite)
- Profil compilé : 620ms → 13ms (cache)

### Commits

- `474747d route celestin factual queries through an LLM intent classifier` — classifier + wiring
- `5953bfc drop dead regex code from celestin SQL routing` — suppression ~600 lignes regex + simplify (table-driven filters, single-pass collectAvailableValues, etc.)
- `aa2964c prune accumulated dead paths from celestin runtime` — quick wins audit (greetingContext mort, whitelist producteurs, fallback memories, Mistral provider)

Net : **-809 lignes** sur 12 fichiers.

---

## Archive — plan original (2026-04-22)

Ce qui suit est le plan tel qu'il a été rédigé avant implémentation. Gardé à titre historique pour la valeur de post-mortem (cas de faux positifs documentés, arbitrage classifier vs tool calling, pre-filter).

## Où on en est

Tâche #2 du chantier mémoire Celestin (routeur SQL pour questions factuelles) a été implémentée avec succès partiel : le système sait aujourd'hui détecter les questions factuelles, extraire des filtres (millésime, pays, région, appellation, domaine, cuvée, dates, week-end, mois), fabriquer des blocs texte structurés et les injecter dans le prompt Celestin.

Les cinq intents factuels (temporal, geographic, quantitative, ranking, inventory) sont reconnus. Le système tient, 35 tests unitaires passent, plusieurs bugs de données (séminaire, Médéric, Saint Genis Laval, en mars) ont été corrigés après validation manuelle.

## Pourquoi on refait

L'implémentation actuelle fonctionne mais **est fondamentalement fragile**. Au fil des tests manuels sur la vraie cave de l'utilisateur, on a découvert une série de faux positifs qui ont nécessité des patches successifs :

- "mars" matche l'appellation "Marsannay" (via substring `includes`)
- "laval" matche la région "Val de Loire" (via `term.includes(token)`)
- "Saint" (dans "Saint Genis Laval") matche toutes les appellations Saint-* (Saint-Estèphe, Saint-Julien, Morey-Saint-Denis, Nuits-Saint-Georges…)
- "rôti" (dans "poulet rôti") matche l'appellation "Côte Rôtie"
- Le mot "mes" a failli matcher des cuvées
- Le prompt durci pour exhaustivité est entré en conflit avec la règle persona "3-5 lignes max"

À chaque cas on a ajouté une blocklist ou un pattern. Résultat : 4 sets de mots-bruits (`TEMPORAL_NOISE_TERMS`, `TOPONYM_NOISE_TERMS`, `FREE_LOCATION_STOP_TERMS`, `NON_FACTUAL_PATTERNS`), chacun fragile et incomplet. Le whack-a-mole va continuer parce que quasi tous les mots français courants sont sous-chaîne d'une appellation réelle (français de France en particulier).

Le problème architectural de fond : **la détection d'intent et l'extraction d'entités se font avec le même moteur (regex + substring)**. Ce moteur est inadapté à la langue naturelle. Il marche sur des cas précis mais rompt dès qu'on confronte la vraie diversité du corpus vinicole français.

On pensait avoir choisi "zéro latence, explicable, suffisant" (décision #1 d'origine). En pratique, "suffisant" ne tient pas à l'épreuve du terrain et la dette de maintenance explose. On a aussi constaté que forcer le LLM à l'exhaustivité sur des inventaires volumineux produit des hallucinations (Celestin inventant Pierre Damoy/Gouges/Coursodon quand on lui demande d'énumérer tous les 2015 en cave). Même fragilité structurelle.

## Direction validée

**Simplification massive** : supprimer toute la couche de détection regex (patterns d'intent, mots-bruits, extraction d'entités par substring) et la remplacer par un classifier LLM qui retourne du JSON structuré.

Modèle conceptuel clair : la base est trivialement interrogeable ("Ctrl+F amélioré" — c'est le rôle des query builders existants). La complexité est 100% dans la traduction "français → filtre structuré". C'est une tâche de NLU, pas de data. L'outil naturel pour ça est un LLM, pas du regex.

On garde donc :
- Les query builders SQL (temporal, geographic, quantitative, ranking, inventory) — ils sont déterministes, testés, ils fonctionnent
- La sérialisation en bloc texte pour l'injection dans le prompt Celestin
- Les tests unitaires (devenus un corpus de validation pour le nouveau classifier)
- Le panel debug /debug avec testeur manuel

On supprime :
- Tous les patterns regex de détection (TEMPORAL_PATTERNS, QUANTITATIVE_PATTERNS, RANKING_PATTERNS, INVENTORY_PATTERNS, NON_FACTUAL_PATTERNS)
- Les sets de mots-bruits (TEMPORAL_NOISE_TERMS, TOPONYM_NOISE_TERMS, FREE_LOCATION_STOP_TERMS)
- Les regex FREE_LOCATION_PATTERN et scope detection
- La fonction `extractExactFiltersFromQuery` côté `tastingMemoryFilters.ts` (peut-être partiellement, à trancher)

## Classifier vs Tool calling

Deux approches ont été évaluées.

**Tool calling (function calling)** : un seul appel LLM dans lequel Celestin voit la question + les tools déclarés, et choisit de répondre directement ou d'appeler `search_bottles(...)`. Si appel d'outil, on exécute le SQL, on repasse le résultat, le LLM génère la réponse finale. Élégant. Single source of truth pour l'intention.

**Classifier JSON dédié en amont** : un petit appel LLM indépendant, prompt court, qui reçoit la query et recrache `{isFactual, intent, filters}`. Le code applique une décision binaire. Si factual, on exécute SQL et on injecte comme aujourd'hui. Puis appel principal Celestin inchangé.

**Choix retenu : classifier JSON.** Raisons :

1. La Celestin edge function a Gemini primaire + GPT-4.1 mini fallback. Tool calling nécessite de maintenir un format de tools par provider (OpenAI, Google, Anthropic ont chacun leur schéma). Multiplication du coût de maintenance.
2. Le classifier JSON est provider-agnostique via JSON schema standard.
3. Le flow actuel `celestinChatRequest.ts` → edge function est stable. Insertion d'un classifier en amont est additive et non invasive : on remplace `routeFactualQuery` par `classifyIntent` dans le module `src/lib/sqlRetrievalRouter.ts`, le reste du pipeline ne change pas.
4. Debug plus clair : le JSON structuré se lit immédiatement dans le trace, pas besoin de démêler un flux de tool_use.
5. On pourra migrer vers tool calling plus tard quand/si le bénéfice le justifie — le travail fait pour le classifier est réutilisable (même schéma conceptuel).

## Gestion de la latence : pre-filter avant classifier

Un classifier systématique ajoute ~200-300ms de latence sur chaque tour Celestin, même sur des questions 100% conversationnelles ("parle-moi du Savagnin", "accord pour un poulet rôti"). Coût financier négligeable (~€0.15/an/user) mais latence perçue gênante.

Solution : un **pre-filter ultra-léger** côté client qui décide si la query *pourrait* être factuelle et donc justifie un appel classifier.

Le pre-filter ne tente pas d'extraire des entités (donc pas de piège Marsannay). Il cherche uniquement des signaux binaires "sent factuel" vs "sent conversationnel" :

- Présence de chiffres dans la query
- Présence de mots-clés de requête factuelle : `combien`, `quels`, `quelles`, `mes`, `ai-je`, `liste`, `meilleur`, `meilleure`, `pire`, `top`, `nombre`
- Présence de marqueurs temporels explicites : `hier`, `avant-hier`, `en janvier..decembre`, `ce week-end`, `cette semaine`, `ce mois`

Si aucun signal → appel Celestin direct (comportement d'aujourd'hui pour le conversationnel).
Si signal → appel classifier LLM pour extraire proprement les filtres, puis appel Celestin avec bloc SQL si confirmé.

Permissif par design : faux positifs = 300ms de latence superflue, pas de bug fonctionnel. Faux négatifs (factuel non détecté) sont rares parce que les mots-clés sont larges. Le pre-filter diffère du regex d'aujourd'hui parce qu'il ne fait PAS d'extraction d'entités — il ne cherche pas à dire "mars → Marsannay", il demande juste "cette phrase sent-elle le factuel ?". Robuste.

## Plan d'implémentation détaillé

### 1. Créer la edge function `classify-celestin-intent`

Nouveau module `supabase/functions/classify-celestin-intent/index.ts`. Signature :

```
POST body: { query: string, availableCountries: string[], availableRegions: string[], availableAppellations: string[], availableDomaines: string[] }
Response: { isFactual: boolean, intent: "temporal"|"geographic"|"quantitative"|"ranking"|"inventory"|null, filters: { millesime?: number, country?: string, region?: string, appellation?: string, domaine?: string, cuvee?: string, dateRange?: {start: string, end: string}, freeLocation?: string }, scope: "drunk"|"cave"|"both"|null, confidence: number }
```

Implémentation : prompt Gemini 2.5 Flash avec response format JSON strict (Gemini le supporte nativement via `response_schema`). Fallback GPT-4.1 mini. Prompt court (~15 lignes) qui liste les intents et force le JSON.

Passer les valeurs connues de la base (countries, appellations, etc.) pour que le classifier retourne des valeurs canoniques, pas des versions approximatives.

Exemple de prompt :
> Tu es un classifier. Analyse la query utilisateur sur son application d'oenologie et retourne un JSON strict. Les intents possibles sont : temporal, geographic, quantitative, ranking, inventory, null (si conversationnel). Ne choisis un intent que si la query appelle vraiment une recherche factuelle dans la base. "Accord mets/vin", "parle-moi d'un cépage", "que boire ce soir" → null. Pour les filtres, utilise uniquement les valeurs fournies ; si la query mentionne une entité non reconnue, freeLocation.

### 2. Créer `src/lib/celestinIntentClassifier.ts`

Module client qui appelle la edge function et cache le résultat par query string. Signature :

```ts
classifyFactualIntent(query: string, cave: Bottle[], drunk: Bottle[]): Promise<ClassifiedIntent | null>
```

### 3. Créer `src/lib/celestinIntentPreFilter.ts`

Petite fonction locale :

```ts
export function mightBeFactual(query: string): boolean
```

Logique simple (~30 lignes) : regex sur les mots-clés et les chiffres. Aucun set de mots-bruits, aucune extraction.

### 4. Remplacer `routeFactualQuery` par `routeFactualQueryViaClassifier`

Dans `src/lib/celestinChatRequest.ts` :

```ts
if (mightBeFactual(input.message)) {
  const classified = await classifyFactualIntent(input.message, input.cave, input.drunk)
  if (classified?.isFactual && classified.intent) {
    const sqlRetrieval = buildSqlBlockFromClassification(classified, input.cave, input.drunk)
    // ... injection comme aujourd'hui
  }
}
```

Les query builders actuels (temporal/geographic/quantitative/ranking/inventory) sont réutilisés mais reçoivent des filtres propres issus du classifier, plus des sorties regex.

### 5. Suppression progressive de l'ancien code

Une fois le nouveau flow validé :

- Supprimer dans `src/lib/sqlRetrievalRouter.ts` : tous les patterns regex et les sets de mots-bruits. Garder uniquement les builders et la sérialisation.
- Supprimer dans `src/lib/tastingMemoryFilters.ts` les fonctions d'extraction d'entités par query (`extractExactFiltersFromQuery`, `queryMentionsIdentityValue`, `termMatchesIdentity`, `extractMillesimesFromQuery`, `extractDateFiltersFromQuery`, les sets de noise).
- Adapter le chemin mémoire sémantique (`buildMemoryEvidenceBundle`) qui utilise aussi ces fonctions. À voir en détail — peut-être maintenir `extractExactFiltersFromQuery` pour ce chemin, ou le migrer aussi sur le classifier.

### 6. Adaptation des tests

- `sqlRetrievalRouter.test.ts` devient `sqlRetrievalBuilders.test.ts` et teste uniquement les builders (étant donné des filtres en entrée, on obtient tel bloc en sortie).
- Nouveau fichier `celestinIntentClassifier.test.ts` qui mock la edge function et teste le mapping classifier → builders.
- Nouveau fichier `celestinIntentPreFilter.test.ts` pour les cas limites du pre-filter.
- Le corpus de 35 tests actuels devient un corpus de validation du classifier (query → intent attendu), idéalement lancé périodiquement contre le vrai classifier en prod pour détecter les régressions de modèle.

### 7. Adaptation du prompt Celestin

Une fois le bloc SQL garanti propre par le classifier (entités canoniques, pas de faux positifs), on peut **alléger** les règles anti-hallucination du prompt dans `context-builder.ts`. La version actuelle est défensive et conflictue avec la persona "concis". Nouveau prompt plus court, plus confiant dans les blocs SQL.

### 8. Conservation du panel debug

Le `DebugSqlRetrievalPanel` dans `/debug` reste. On remplace `routeFactualQuery` par `classifyFactualIntent` + builders pour montrer en direct ce que le classifier a inféré + ce que le SQL a retourné.

## Décision 2026-04-23 : appel classifier systématique, pas de pre-filter

Le pre-filter imaginé initialement (détecter si une query "sent factuelle" avant d'appeler le classifier) a été abandonné après réflexion. Raison : en français conversationnel, "mes", "ce soir", "cette semaine", les chiffres, les possessifs sont omniprésents même dans les questions purement conversationnelles ("je cherche un rouge pour mes invités ce soir"). Estimation : le pre-filter aurait déclenché le classifier sur 80-90% des tours malgré tout. Le gain de latence (300ms évités sur 10-20% des tours) ne justifie pas la complexité d'un second module, ni le risque de faux négatif (factuel manqué à cause d'un pre-filter trop strict).

**Décision retenue** : classifier appelé **systématiquement** sur chaque tour. +300ms uniformes. Coût annuel ~€0.20/user (négligeable). Un seul chemin de décision, un seul module, zéro risque de faux négatif côté pre-filter. Si à l'usage l'UX montre une gêne sur des patterns triviaux ("merci", "salut", messages très courts), on ajoutera un pre-filter *ultra-restrictif* a posteriori, avec données d'usage à l'appui plutôt que par heuristique a priori.

## Articulation avec le turn interpreter existant

L'edge function Celestin contient déjà un turn interpreter déterministe qui classifie chaque tour en cognitive_mode (greeting / social / wine_conversation / tasting_memory / restaurant_assistant / recommendation) à partir de l'état de conversation et des signaux. Le classifier SQL opère sur un axe différent (retrieval : quelles données injecter) mais il y a chevauchement potentiel.

**Phase 1 (refonte SQL, immédiate)** : classifier côté client, turn interpreter inchangé côté edge function. Les deux systèmes restent isolés. Ajouter dans le trace debug la juxtaposition des deux décisions (cognitive_mode + classifier output) pour détecter à l'usage les cas de décalage (ex: classifier dit factuel mais turn interpreter reste en social, ou inversement).

**Phase 2 (à prévoir plus tard, pas demain)** : déplacer le classifier dans l'edge function, en amont du turn interpreter. Son output (isFactual, intent, filters) devient un signal d'entrée du turn interpreter qui peut alors prendre des décisions mieux informées. Un seul lieu de routage, cohérence garantie, suppression de redondance.

Ne pas précipiter la phase 2 : d'abord valider en conditions réelles que le classifier est fiable, que ses décisions sont cohérentes avec celles du turn interpreter, et que le chevauchement actuel n'est pas problématique. Puis faire la fusion.

## Effort estimé

- Edge function classify-celestin-intent : 2-3h (prompt + JSON schema + fallback + déploiement)
- Module client + pre-filter : 1h
- Wiring + suppression de l'ancien code : 2h
- Migration des tests : 1-2h
- Re-test manuel + ajustement prompt : 1h

Total grosso modo une session focalisée de 6-8h, soit une journée.

## Rappels importants (toujours valides)

- Le backfill d'enrichissement (`runEnrichBackfill` dans `/debug`) reste à exécuter en prod pour remplir les champs country/region manquants (cas Sanlorenzo). Indépendant de cette refonte mais améliore aussi le chemin classifier car celui-ci s'appuie sur les valeurs canoniques présentes dans la base.
- La règle anti-hallucination absolue tient : le LLM ne doit JAMAIS mentionner un vin hors du bloc SQL injecté. Le classifier protège en amont, le prompt final protège en aval.
- Règle produit : inventaires >5 fiches renvoient vers la page Cave, pas d'énumération exhaustive dans le chat. Implémenté via `inventoryDisplayHint`, à préserver.

## Suite logique (après cette refonte)

- **Allègement du prompt anti-hallucination** dans `supabase/functions/celestin/context-builder.ts`. La version actuelle (datant de l'époque où le classifier n'existait pas) empile ~350 tokens de règles défensives qui conflictent avec la persona "3-5 lignes". Maintenant que le bloc SQL est garanti propre par le classifier, on peut réduire à 3 bullets. Demande un cycle de re-test manuel + eval harness.
- **Streaming de la réponse LLM principale** : chantier à part, gros gain latence perçue attendu (-1.5s sur tous les tours).
- **Unification des patterns de recommandation** client (`celestinChatRequest.ts`) et serveur (`turn-signals.ts`) : pas un doublon strict mais deux chevauchements qui divergent. Voir audit 2026-04-22.
