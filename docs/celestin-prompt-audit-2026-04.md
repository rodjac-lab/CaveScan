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

## Phase 3 — Comparaison multi-LLM + audit prompts (2026-04-28/29)

Session combinée : on attaque deux questions stratégiques en parallèle.

1. **Tester d'autres LLM** (Claude Haiku 4.5, GPT-4.1 mini) plutôt que d'écrire du code anti-drift Gemini-spécifique pour J3/J4.
2. **Nettoyer les prompts** des règles défensives héritées d'avant l'orchestrateur déterministe (Turn Interpreter + Response Policy + sanitizeFacts + SQL routeur).

### Méthodologie : mesure → modification → re-mesure

- Pass 1 (prompts actuels) sur 3 providers
- Audit prompts (suppression chirurgicale des règles redondantes avec garanties pipeline)
- Pass 2 (prompts allégés) sur 3 providers
- Comparaison delta par provider × critère

### Infra ajoutée

- **`--provider <gemini|claude|openai>`** sur `scripts/scorecard-celestin.mjs` (capitalise sur `forcedProvider` déjà accepté par `celestinWithFallback`).
- **`--throttle-ms <N>`** pour espacer les appels (résout collision rate-limit Anthropic quand Celestin et le judge tapent tous les deux Claude).
- **Latency par appel** capturée et agrégée (mean/p50/p95/min/max), sortie dans le rapport et la console.
- **Filename suffixé** par provider : `scorecard-{provider}-{ts}.{json,md}` pour comparaison facile.
- **`callClaude` activé en fallback chain** dans `llm-providers.ts:144-146` (avant : seulement Gemini + OpenAI ; maintenant : Claude → Gemini → OpenAI).

### Suspects identifiés (pré-scan + verification)

Garanties pipeline qui rendent certaines règles prompt redondantes :

| Garantie | Fichier | Ce qu'elle couvre |
|---|---|---|
| `limitExclamations` | `response-policy.ts:38` | Strip `!` excédentaires post-LLM |
| `stripBannedOpener` | `response-policy.ts:38` | Strip "Ah/Oh/Tiens/Bon/..." en début post-LLM |
| `shouldAllowUiAction` | `response-policy.ts:41` | Strip `ui_action` interdit post-LLM (déterministe via Turn Interpreter) |

**Distinction critique** : les "PAS de ui_action" sont **morts** (strip post-LLM existe). Les "use show_recommendations IMMEDIATEMENT" sont **vivants** (la policy ne FORCE pas un ui_action, elle ne fait que strip ceux interdits — donc l'incitation prompt reste utile).

### Suppressions effectives

| Fichier | Ligne(s) supprimée(s) | Justification |
|---|---|---|
| `persona.ts` | "Mots INTERDITS en debut de message ... SUPPRIME-LE" | Couvert par `stripBannedOpener` |
| `persona.ts` | "Maximum 1 point d'exclamation par message" | Couvert par `limitExclamations` |
| `rules.ts` | "Pas de ui_action (conversation libre)" + "N'ajoute JAMAIS de ui_action pour une question de connaissance" + "Pas de nouvelle ui_action" | Couvert par strip déterministe |
| `rules.ts` | Section "## Pas de ui_action" du `CELESTIN_RULES_MEMORY_ONLY` | Couvert par strip déterministe |
| `user-prompt.ts` | 6 occurrences de `[... PAS de ui_action ...]` dans 6 branches (social_ack, task_cancel, smalltalk, tasting_memory, cellar_assistant, unknown) | Couvert par strip déterministe |
| `user-prompt.ts` | `ne declenche PAS de ui_action` (PIVOT EXPLORATOIRE) | Couvert par strip déterministe |
| `wine-codex.ts` | "Avec le fromage, la bonne intuition est souvent de penser d'abord au blanc" (L67) | Doublon interne avec L13 (plus complet) |

**Conservés volontairement** :
- "use show_recommendations IMMEDIATEMENT" et "envoie prepare_add_wine IMMEDIATEMENT" : incitations actives, pas couvertes par strip.
- "JAMAIS de question rhétorique en fin" et "Pas de théâtre ni de lyrisme" : pas de strip déterministe en place, règles vivantes.
- "Ne propose PAS d'autres vins" dans ACQUITTEMENT : guide le contenu, pas le ui_action.

### Résultats — Pass 1 (prompts actuels) vs Pass 2 (prompts allégés)

#### OVERALL

| | Pass 1 | Pass 2 | Δ |
|---|---|---|---|
| **Gemini 2.5 Flash** | 94.3% | 94.7% | +0.4 |
| **Claude Haiku 4.5** | 96.7% | 96.4% | -0.3 |
| **GPT-4.1 mini** | 96.8% | 93.9% | **-2.9** |

#### Critères sémantiques (Pass 2)

| Critère | Gemini | Claude | OpenAI |
|---|---|---|---|
| J1 anti_echo | 90.1% (=) | 90.6% (=) | 87.3% (-4.1) |
| J2 no_rhetorical | **94.4%** (+4.3) | **98.4%** (=) | 88.7% (-7.0) |
| J3 no_theatre | 87.3% (-1.4) | **92.2%** (-3.2) | 83.1% (-6.9) |
| J4 no_permission | 90.1% (+1.4) | **93.8%** (-3.1) | 93.0% (-2.7) |
| J5 direct_answer | 95.8% (=) | **96.9%** (+3.1) | **100%** (=) |
| C4 reco_cards | 95.5% (-4.5) | 93.8% (+5.6) | 90.9% (-9.1) |

#### Latence Pass 2

| | mean | p50 | p95 | max |
|---|---|---|---|---|
| Gemini | 2.6s | **2.2s** | 4.8s | 15.0s |
| Claude | 3.7s | 3.4s | **6.0s** | **7.1s** |
| OpenAI | 3.4s | 2.6s | 6.4s | 14.9s |

(L'outlier OpenAI 1036s observé en pass 1 a disparu — incident ponctuel hier, pas systémique.)

### Apprentissages clés

1. **L'audit n'a pas eu l'effet "boost universel" espéré**. Globalement dans le bruit de mesure (judge LLM ±2pt). Hypothèse "Gemini drift à cause des prompts surchargés" **non validée** : il drift parce qu'il drift, pas à cause de la surcharge.
2. **Signal positif Claude J5 (+3.1)** : la suppression des "PAS de ui_action" l'a libéré pour répondre plus directement. **UX wins observés en pass 1** (clarification avant reco, conservatisme cards) confirment l'hypothèse "libération".
3. **Régression OpenAI (-2.9 global)** : pattern inverse. **GPT-4.1 mini est prompt-dépendant** — il s'appuyait sur les règles défensives pour rester sobre. Sans elles, il dérive vers le théâtre (J3 -7, J2 -7). Mauvais signe pour une stratégie multi-provider transparente avec OpenAI.
4. **Le scorecard sous-estime Claude** : ses "fails" C4 (1 carte quand cellier insuffisant) et J5 (clarification questions) sont en réalité des **UX wins**. Score corrigé Claude pass 2 ≈ 96.6-96.8% (vs 96.4% brut).
5. **Plafond actuel ~96-97%** sur Gemini/Claude/OpenAI **non-thinking**. Pour aller au-delà : strip déterministe ciblé OU thinking models (incompatibles latence chat) OU fine-tuning.
6. **Anomalie technique Claude** : 2 fails sur J5 sont des erreurs JSON parse (Claude renvoie texte brut au lieu de JSON). `callClaude` n'utilise pas Anthropic Tool Use ou structured output — fixable, ~1h de travail.

### Décision

Aucun challenger ne franchit le critère initial (+3 pts vs Gemini ET zéro régression individuelle). Mais **Claude bascule en primaire pour dogfood** (Gemini fallback, OpenAI ultime fallback) parce que :

- Domine clairement les drifts Gemini connus (J2 +8.4, J3 +5, J4 +3.7 vs Gemini Pass 2)
- UX wins validés par Rodol (subtilité, clarification, conservatisme)
- Latence acceptable pour chat (3.4s p50, 6s p95, max 7.1s — pas d'outliers monstres)
- Coût marginal négligeable pour Celestin (<$0.01 par conversation)
- Réversible (5 lignes dans `llm-providers.ts`)

Critère de retour à Gemini : si après 1-2 semaines de dogfood la latence ou la subtilité ne convainquent pas, switch back trivial.

### À tester demain — modèles non-thinking récents

Investigation post-décision sur les modèles SOTA équivalent-tier (web search) :

| Modèle | Statut | Thinking | Notes |
|---|---|---|---|
| **Gemini 3.1 Flash-Lite** (preview, sorti 3 mars 2026) | À tester | `thinking_level: minimal` ≈ pas de thinking, pas de full-off strict | **2.5× plus rapide que Gemini 2.5 Flash** sur Time to First Token, $0.25/1M input |
| **Gemini 3 Flash** (preview) | À tester | Idem | Plus rapide que 2.5 Flash, prix nc |
| **GPT-5.4 mini** | À tester | Non-thinking (fallback rate limit du Thinking) | **>2× plus rapide que GPT-5 mini** |
| **GPT-5.4 nano** | Optionnel | Non-thinking | $0.20/1M input, ultra low-cost |
| **Claude Haiku 4.5** | Déjà testé (primaire dogfood) | Non | Latest small Anthropic |

**Gemini 3.1 Flash-Lite est le candidat le plus prometteur** : pourrait baisser les drifts ET la latence simultanément. Si confirmé, devient un nouveau primaire candidat plus solide que Claude (latence plus proche du baseline actuel).

**Effort technique** : ajouter 1-3 nouvelles call functions dans `llm-providers.ts` (pattern identique à callGemini/callClaude/callOpenAI, juste model ID + endpoint à changer). Étendre `--provider` du scorecard. ~1-2h de dev + ~$0.60 et ~15min de scorecard.

### Backlog résiduel

- **Strip déterministe ciblé** dans `response-policy.ts` pour les drifts Gemini résiduels (J3 théâtre, J4 softeners) si on revient à Gemini
- **Anthropic Tool Use** sur `callClaude` pour fixer les 2 erreurs JSON pass 2 (~1h)
- **Audit orchestrateur** (Vague 2 du plan original) : state machine 6 états, factorisation cognitive modes — déprioritisé tant que Claude est en dogfood
