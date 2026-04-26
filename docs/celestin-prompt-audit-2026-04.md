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

## extract-chat-insights/prompt.ts (audité 2026-04-26)

**Pré-requis posés avant l'audit** :
- Prompt extrait dans `prompt.ts` (séparé du runtime Deno) pour permettre snapshot test côté Vitest.
- Snapshot test du prompt → `extract-chat-insights.test.ts`.
- Tests unitaires de `sanitizeFacts` (T3) → `src/lib/sanitizeFacts.test.ts` (15 cas), documente le filet de sécurité.

**Découverte clé** : `WINE_KNOWLEDGE_QUESTION_PATTERNS` (T3) attrape les **méta-formulations** ("se demande", "s'intéresse à la différence", "demande à celestin") mais pas les facts directs comme "Aime comparer Barolo et Barbaresco". La règle prompt L83 garde donc une utilité résiduelle — condensée plutôt que supprimée.

| # | Règle (extrait court) | Garantie pipeline | Statut | Justification |
|---|----------------------|-------------------|--------|---------------|
| L75-76 | "Capture les meta-preferences explicites... 4 exemples" | aucune (sémantique pure) | **CONDENSÉE** | Liste d'exemples 4 → 3, retrait de `pas trop technique` (proche de `explique-moi simplement`). |
| L83 | "Les questions ponctuelles de culture vin... ne sont PAS des facts wine_knowledge durables, sauf si explicitement..." | T3 `WINE_KNOWLEDGE_QUESTION_PATTERNS` (couvre méta-formulations) | **CONDENSÉE** | Reformulé en principe ("ce que SAIT vs ce que demande") au lieu de liste d'exemples qui doublent T3. La clause d'exception (renvoi à L75-76) supprimée car L75-76 stand-alone. |

**Bilan A** :
- ~36 tokens économisés par appel à extract-chat-insights (~3 700 → ~3 588 chars).
- Impact direct : extraction mémoire en fin de chaque session de chat → marginal en wall-clock mais récurrent.
- Garde-fou inchangé : T3 continue de filtrer les questions de culture vin déguisées en facts.
- Snapshot + sanitizeFacts.test.ts en place pour les futurs audits.

## persona.ts / rules.ts (priorité 2 — pas dans cette session)

À auditer dans une session suivante. Plus risqué (ces fichiers conditionnent la voix Celestin
dans tous les modes). Méthodologie : profiter du snapshot prompt-builder pour mesurer l'impact.

## persona.ts (audité 2026-04-26 après-midi — cluster "quand citer un souvenir")

**Cluster identifié** : 4 bullets (L13/L14/L15/L16) traitent toutes du même thème — *quand mentionner un vin de la cave ou un souvenir*. Forte duplication entre L14 (PERTINENCE) et L15 (SOBRIETE MEMOIRE). Noyau commun : "ne cite un souvenir QUE si pertinent". L14 ajoute "commence par répondre, pas de lien forcé"; L15 ajoute "3 cas autorisés (souvenir / justifier / éviter erreur)". L16 traite un cas spécial (analogie sur question générale).

| # | Règle (extrait) | Statut | Justification |
|---|----------------|--------|---------------|
| L13 | "Tu t'en sers naturellement... Ne force jamais un souvenir" | **CONDENSÉE** | Fin redondante avec L14 fusionnée. Reformulé en "à table entre amis : naturellement, jamais pour montrer que tu te souviens". |
| L14 | PERTINENCE : ne cite QUE si pertinent + commence par répondre | **FUSIONNÉE avec L15** | Noyau gardé, 3 cas explicites de L15 ajoutés inline. |
| L15 | SOBRIETE MEMOIRE : ne cite QUE si change qualité, 3 cas autorisés, sinon implicite | **FUSIONNÉE dans L14** | Disparaît en tant que bullet séparée — son contenu utile (3 cas + "implicite sinon") est intégré dans la règle PERTINENCE consolidée. |
| L16 | PAS D'ANALOGIE FORCEE : 3 formules ("dans mon style", "comme ce que j'aime", "comme ce qu'on avait bu") | **RACCOURCIE** | 3 formules → 2 (suppression "dans mon style" très proche de "comme ce que j'aime"). Conservée comme bullet séparée car traite un cas distinct (questions générales). |

**Bilan** :
- 4 bullets → 3 (~25% de réduction du paragraphe persona).
- Sémantique préservée : tous les "interdits" et "permissions" de l'original restent exprimés.
- Snapshots prompt-builder : **6 modes mis à jour** (greeting, social, wine_conversation, tasting_memory, restaurant_assistant, cellar_assistant) — diff isolé aux 4 bullets ciblés, aucun autre changement.
- Eval LLM : **40/40 pass** (145s, 2026-04-26 17h13).
- `npm run verify` : lint + build + 250 unit + 6/6 e2e flows verts.

## rules.ts (audité 2026-04-26 après-midi — section "Regles cave")

**Cluster identifié** : section "Regles cave" (L43-L47) contient une duplication d'emphase entre L44 et L45 sur la même règle (priorité des données cave sur les connaissances LLM).

| # | Règle (extrait) | Statut | Justification |
|---|----------------|--------|---------------|
| L44 | "Ne change JAMAIS couleur, cuvee ou format... Si la cave dit 'rouge', le vin est rouge..." | **FUSIONNÉE avec L45** | Noyau gardé, "AUCUNE exception" intégré inline. |
| L45 | "Un rouge reste rouge. Un blanc reste blanc... AUCUNE exception." | **SUPPRIMÉE** | Pure emphase répétitive de L44. La règle de couleur est déjà dans L44 ("Ne change JAMAIS couleur..."). |

**Bilan** :
- Section "Regles cave" : 5 bullets → 4.
- Sémantique préservée : la priorité données cave + l'emphase "AUCUNE exception" restent toutes deux dans la règle consolidée.
- Snapshots prompt-builder : **2 modes mis à jour** (`restaurant_assistant`, `cellar_assistant`) — seuls modes qui chargent `CELESTIN_RULES`. Diff isolé à la section ciblée, aucun autre changement.
- Eval LLM : **40/40 pass** (143s, 2026-04-26 17h22).
- `npm run verify` : lint + build + 250 unit + 6/6 e2e flows verts.

## Phase 2 scorecard — findings 2026-04-26 soir

Phase 2 du scorecard (5 critères sémantiques jugés par Claude Haiku 4.5 via la nouvelle edge function `scorecard-judge`) livrée et calibrée. Baseline sur 71 réponses : **OVERALL 94.2%** (556/590 critères pass), avec 34 fails sémantiques que les 4 critères déterministes ne voyaient pas.

**Diagnostic honnête** : la plupart des fails sémantiques détectés (J3 80.3% surtout, J1 90.1%, J4 93%) sont des **travers connus de Gemini 2.5 Flash** :

- **J3 no_theatre** (14 fails, le plus net) : drift lyrique récurrent. Mots-types attrapés : *pépites, polishé, noble, incroyable, parfait, ultra, totalement, superbement*. Gemini préfère les superlatifs et l'emphase malgré la directive persona "Pas de théâtre ni de lyrisme". Même pattern que le bug `Ah/!` mais sur du contenu lexical, donc **moins facile à fixer en déterministe** (suppression mécanique = trou syntaxique).
- **J1 anti_echo** (7 fails) : reprise en début de réponse, surtout sur les actes d'encavage ("Trois Chablis 2022, c'est noté !" au lieu de "C'est noté."). Pattern modeste, parfois intentionnel.
- **J4 no_permission_seeking** (5 fails) : softener "On peut y remedier si tu veux !" au lieu d'agir directement.
- **J2** (4 fails) et **J5** (3 fails) : marginal.

**Décision archi** : Phase 2 du scorecard est **opt-in** (`--with-judge` flag, off par défaut). Raisons :
- Ces drifts sont reproductibles et largement connus — pas la peine de les remesurer à chaque commit.
- Le coût ($0.20/run) et la latence (~5min) ne se justifient que pour valider un fix ciblé sur un de ces patterns.
- Les 4 critères déterministes (par défaut, ~$0.10/run, ~2.5min) restent le KPI de progrès quotidien.

**À reprendre dans une session fraîche** :
- J3 lyrisme : la suppression déterministe des **adverbes intensificateurs** (`ultra`, `totalement`, `incroyable`, `parfaitement`) est probablement la voie la plus propre — le mot-noyau reste, la phrase tient. Substitution de mots-noyaux (`pépites` → `vins`) est plus risqué côté lisibilité.
- J1 encavage : possible fix prompt ciblé (au lieu de "Trois Chablis 2022, c'est noté", juste "C'est noté").
- J4 softeners : pattern `on peut .* si tu veux` peut être attrapé par un strip déterministe ciblé sur la fin de phrase.

Commands :
- `npm run scorecard:celestin` — déterministe seul (default, ~$0.10).
- `npm run scorecard:celestin:with-judge` — Phase 2 complet (~$0.20).
