# Audit prompts Celestin — Avril 2026

## Contexte

Suite à la clôture du chantier mémoire (avril 2026), une nouvelle doctrine
**"DB = bac brut, compilation = contrat de qualité"** est en place. Plusieurs
règles défensives empilées dans les prompts système Celestin sont devenues
redondantes avec les nouvelles garanties pipeline (T3 sanitization, sqlRetrievalRouter,
Turn Interpreter, Response Policy).

Ce document trace, fichier par fichier et règle par règle, ce qui a été
allégé/supprimé/conservé et pourquoi. Sert aussi de mémoire pour les
audits futurs sur d'autres prompts (extract-chat-insights, extract-tasting-tags, etc.).

## Méthodologie (rappel)

Pour chaque règle candidate à modification :
1. Identifier la garantie pipeline qui la rend redondante.
2. Modifier dans un commit atomique (1 règle = 1 commit, sauf fusions évidentes).
3. `npm test` → snapshot diff vérifié → `npx vitest -u` si intentionnel.
4. `npm run eval:celestin` → 0 régression vs baseline 40/40.
5. Dogfood manuel sur le mode impacté.
6. Approbation Rodol explicite avant push.

**Critères de rollback** :
- 1+ scénario eval qui passait fail après → rollback du commit, marquer la règle "non supprimable".
- Snapshot change dans un mode non visé → investigation.
- Régression dogfood subjective → rollback même si eval pass.

## Baseline pré-audit

- **40 cas eval** : 10 single-turn + 30 conversations multi-turn (toutes pass dans baseline 2026-04-26).
- **15 snapshots prompts** : 6 modes prompt-builder + 6 modes context-builder + 3 memoriesSection.
- Exécution : `npm run eval:celestin` (~2.3 min, ~$0.10).

## context-builder.ts

| # | Règle (extrait court) | Garantie pipeline | Statut | Commit | Justification |
|---|----------------------|-------------------|--------|--------|---------------|
| 1 | "Ces faits sont exhaustifs pour la question posée" | sqlRetrievalRouter (5 builders déterministes) | **SUPPRIMÉE** | B.2.1 (uncommitted) | Router construit le bloc avec filtres exacts ; pas de bloc partiel possible. |
| 2 | "Le chiffre total est la bonne réponse au combien" | format codifié dans builders | **SUPPRIMÉE** | B.2.1 | Précodé, pas une instruction LLM. |
| 3 | "Si TROP pour lister, donne 2-3 exemples + redirige" | `inventoryDisplayHint()` injecte la consigne dans le bloc SQL lui-même | **CONDENSÉE** | B.2.1 | 1 ligne au lieu de 2 (le détail vit dans le bloc SQL). |
| 4 | "JAMAIS un vin hors du bloc" | persona.ts:18 + rules.ts:43 + sqlRetrievalRouter:195 répètent | **CONSERVÉE** (cet endroit) | B.2.1 | Pas de fusion avec persona/rules sans audit séparé. Cet emplacement est le plus efficace (juste après le bloc). |
| 5 | "Si l'utilisateur demande une note... uniquement note/verbatim" (mode exact) | rules-memory-only.ts couvre, mais seulement en mode tasting_memory | **CONDENSÉE** | B.2.2 | Mergée avec la phrase d'inventaire exact. Conservée car peut s'activer hors tasting_memory. |
| 6 | "Le bloc est la base exacte de synthèse" (mode synthesis) | déjà concise | **INCHANGÉE** | B.2.3 | Déjà 1 ligne. |
| 7 | "Cite des souvenirs spécifiques quand pertinent" (mode permissif) | persona.ts (Souvenirs et préférences) couvre largement | **SUPPRIMÉE** | B.2.4 | Duplique CELESTIN_PERSONA qui dit déjà "use memories naturally when they shed light". |

**Bilan B.2.1-B.2.4** :
- Bloc SQL retrieval : 10 bullets → 5 (50% de réduction).
- Memories section : jusqu'à 4 lignes → 2 (50%).
- Net gain estimé : ~120 tokens par réponse pour les modes cellar_assistant / tasting_memory / wine_conversation.
- Eval LLM final : **40/40 pass** (143s, 2026-04-26).
- `npm run verify` (lint + build + 214 unit + 6 e2e flows) : **vert**, ~2 min.
- Snapshots prompts : 6 modes mis à jour, diff isolé aux modes consommant sqlRetrieval / memories.
- **Bénéfice secondaire mesuré (dogfood Rodol 2026-04-26)** : latence Celestin perçue en baisse sur les 3 modes touchés. Cohérent avec la réduction de ~120 tokens du prompt système (input plus court → moins de traitement Gemini + moins de contexte sur lequel calculer l'attention en génération). À garder en motivation pour les audits suivants (`user-prompt.ts`, `extract-chat-insights/index.ts`).

## persona.ts (priorité 2 — pas dans cette session)

À auditer dans une session suivante après validation du chantier context-builder.

## rules.ts (priorité 2 — pas dans cette session)

À auditer dans une session suivante.

## extract-chat-insights/index.ts (priorité 3)

À auditer en session séparée. La couche T3 (sanitizeFacts + classifyPreferences)
filtre déjà à la compilation ; certaines règles d'extraction du prompt sont devenues
redondantes (anti-inventaire de cave, anti-feedback Celestin).
