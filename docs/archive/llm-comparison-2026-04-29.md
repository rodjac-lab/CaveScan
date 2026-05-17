# Comparaison LLM Celestin — 2026-04-29

Session de test des modèles Gemini 3.x preview pour évaluer un éventuel changement
de primaire. Référence : décision Pass 2 (28 avril) qui avait basculé Claude
Haiku 4.5 en primaire dogfood, Gemini 2.5 Flash en fallback.

## Modèles testés

| Modèle | Statut | Model ID | Thinking |
|---|---|---|---|
| Claude Haiku 4.5 | GA, primaire actuel | `claude-haiku-4-5-20251001` | n/a |
| Gemini 2.5 Flash | GA, fallback actuel | `gemini-2.5-flash` | budget=0 |
| GPT-4.1 mini | GA, fallback ultime | `gpt-4.1-mini` | n/a |
| **Gemini 3.1 Flash-Lite** | **Preview** (3 mars 2026) | `gemini-3.1-flash-lite-preview` | minimal |
| **Gemini 3 Flash** | **Preview** (17 déc 2025) | `gemini-3-flash-preview` | minimal + low testés |

## Méthodologie

- Scorecard standard (10 single-turn + 30 multi-turn = ~71 réponses max).
- 4 critères déterministes (C1-C4) + 5 critères sémantiques (J1-J5) jugés par Claude Haiku 4.5 (`scorecard-judge` edge function).
- Throttle 500ms entre appels pour limiter les 503 rate-limits.
- Fixture commune `evals/celestin-fixture-2026-03-06.json`.

## Résultats agrégés

| Critère | Claude Haiku 4.5 | Gemini 2.5 Flash | **G3 Flash minimal** | **G3 Flash low** | **G3.1 Flash-Lite** |
|---|---|---|---|---|---|
| OVERALL | **96.4%** | 94.7% | 91.5% | 92.0% | (n/a — 50% errors) |
| Excl. J3 | **97.0%** | — | 94.4% | 96.1% | — |
| C1 first_word | 100% | 100% | 100% | 100% | (faux 100%, voir bug) |
| C2 max_5_lines | 100% | 100% | 100% | 100% | — |
| C3 max_1_excl | 100% | 100% | 100% | 100% | — |
| C4 reco_cards 2-5 | 93.8% | 95.5% | 95.5% | 100% | — |
| J1 anti_echo | 90.6% | 90.1% | 87.3% | **96.4%** | — |
| J2 no_rhetorical | **98.4%** | 94.4% | 82.5% | 90.9% | — |
| J3 no_theatre | **92.2%** | 87.3% | 69.8% | **61.8%** | — |
| J4 no_permission | 93.8% | 90.1% | 93.7% | 92.7% | — |
| J5 direct_answer | 96.9% | 95.8% | **96.8%** | 90.9% | — |
| Latence p50 | 3.4s | **2.2s** | 3.0s | 3.1s | 9.1s |
| Latence p95 | 6.0s | **4.8s** | 10.5s | 5.3s | 16s |
| Erreurs 503 | 0 | 0 | 5.6% (4/71) | ~22% (16/71) | ~50% (5/10) |

## Verdicts par modèle

### Gemini 3.1 Flash-Lite — **inutilisable aujourd'hui**

Quick run sur 10 single-turn : 5 erreurs 503 ("This model is currently experiencing
high demand") + 1 timeout 15s. Latence des 5 succès : 8-14s. Préview rate-limité
à mort, alignement non testable.

**Bug scorecard découvert** : les messages d'erreur edge function (`[gemini-flash-lite]
...`) passaient les critères C1-C4 et étaient comptabilisés comme réponses valides
(score factice 100%). Fixé via `isProviderErrorMessage` dans `scripts/scorecard-celestin.mjs` —
les erreurs sont maintenant comptées comme "PROVIDER ERROR" et exclues du scoring.

### Gemini 3 Flash — **régression nette sur la persona**

Plus rapide à tester (preview plus mature, sortie déc 2025). Mais :

- **J3 lyrisme dramatiquement pire** : 69.8% vs Gemini 2.5 87.3% vs Claude 92.2%.
  Drift -22 pts vs Claude.
- **J2 questions rhétoriques pire** : 82.5% vs 98.4% Claude. Le modèle termine
  régulièrement par "Tu as déjà goûté…?", "Qu'est-ce que tu as mis sur ton plateau ?".
- **Latence p95 deux fois pire** que 2.5 Flash (10.5s vs 4.8s).
- **5.6% taux 503**, inacceptable en prod.

Hypothèse vérifiée : `thinkingLevel: 'low'` (vs 'minimal') améliore J1 anti-echo
(+9 pts) et J2 questions rhétoriques (+8 pts) mais **empire J3 lyrisme** (-8 pts).
Le drift lyrisme n'est pas un manque de "concentration", il est intrinsèque au RLHF
du modèle.

**Patterns mécaniques observés au-delà du judge** :

- "pépites" apparaît dans 6/8 réponses examinées
- "On part sur du sérieux pour oublier tes dernières déceptions [savoyardes/jurassiennes]"
  apparaît 3 fois quasi-textuel
- Recadrage négatif gratuit ("tes dernières déceptions" alors que le user n'a pas
  exprimé de déception)
- Ponctuation interdite occasionnelle ("tu n'en as jamais ouvert avec moi !") +
  hallucinations narratives ("avec moi", "dans tes souvenirs")

### Force G3 quand même : exploitation mémoire

Sur le cas `reco_refinement turn 3` ("Tu en as plutôt en blanc ?") :

> G3 : "Le poulet rôti et le Chardonnay, c'est un mariage de raison. Puisque tu as
> déjà liquidé ton Chassagne de chez **PYCM**, on va rester sur ce niveau
> d'excellence avec ce que tu as en réserve."

Vérification fixture :
- 0 PYCM dans la cave actuelle (épuisé)
- 1 PYCM Chassagne-Montrachet 1er Cru 2014 dans les dernières dégustations (4/5)
- 2 Chassagne en cave (Ramonet) = "ce que tu as en réserve"

Tout est juste : abréviation PYCM = Pierre-Yves Colin-Morey (jargon vin), "liquidé"
= bu, "ce que tu as en réserve" = équivalent encore en cave. C'est même mieux que
Claude et G2 sur ce critère mémoire/contexte précis.

**Conclusion** : G3 n'a pas un problème de capacité ou de mémoire. Il a un problème
de **registre persona**. Si Google sort un GA avec un alignement plus sobre, ça
peut basculer la décision.

## Décision

**Statu quo** : Claude Haiku 4.5 reste primaire dogfood. Décision Pass 2 (28 avril)
confirmée. Aucune régression à Gemini 3.

**À retester quand** :
- Gemini 3 Flash passe preview → GA
- Gemini 3.1 Flash-Lite sort du rate-limit preview
- Anthropic sort un Haiku 5 (à surveiller)

## Code livré (commit du 2026-04-29)

Additif et neutre pour la prod (chaîne fallback inchangée, providers accessibles
uniquement via `body.provider` forcé) :

- `supabase/functions/celestin/llm-providers.ts` :
  - Factory `callGeminiModel(modelId, label, …)` extrayant la duplication
  - Providers `callGeminiFlashLite`, `callGemini3Flash`, `callGemini3FlashLow`
  - Entrées correspondantes dans `providerMap` : `gemini-flash-lite`, `gemini-3-flash`, `gemini-3-flash-low`
- `scripts/scorecard-celestin.mjs` :
  - `--provider` accepte les 3 nouvelles valeurs
  - `isProviderErrorMessage()` filtre les messages d'erreur edge function
  - Fix du faux 100% sur runs partiellement-erronés

## Échantillon comparatif (8 cas)

Voir l'historique de la session ou regénérer via :

```bash
node -e "
const claude = require('./evals/results/scorecard-claude-2026-04-28T21-43-13-193Z.json');
const g2 = require('./evals/results/scorecard-gemini-2026-04-28T21-23-35-596Z.json');
const g3 = require('./evals/results/scorecard-gemini-3-flash-low-2026-04-29T19-40-38-275Z.json');
// join sur (scenarioId, turnIndex), filtrer où g3 J3 fail, output 3 réponses + verdicts
"
```
