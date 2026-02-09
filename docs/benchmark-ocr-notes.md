# Benchmark OCR — Claude Haiku 4.5 vs Gemini 2.0 Flash

## Date: 2026-02-09

## Résultats finaux (20 photos)

| | Claude Haiku 4.5 | Gemini 2.0 Flash |
|---|---|---|
| Succès | 19/20 | 18/20 (2 rate-limited) |
| Temps moyen | 2801ms | 3645ms |
| Coût/scan | $0.0021 | $0.0002 (~10x moins cher) |
| Accord global | 78% (85 accords, 24 différences) |

## Analyse qualitative

- **Haiku légèrement plus fiable** : a trouvé 3 infos que Gemini a ratées
- **Gemini** : différences souvent dues à la normalisation (majuscules, accents) — pas des erreurs réelles
- **Photo multi-bouteilles (3 bouteilles)** : Gemini meilleur que Haiku, mais aucun des deux n'a trouvé les 3 bouteilles
- **Haiku a inventé un domaine** sur la photo multi-bouteilles (hallucination)
- **Gemini rate-limiting** : Tier 1 Google = quota bas en rafale. Pas un problème en usage normal (1 scan à la fois)

## Décision

- **Primary : Claude Haiku 4.5** (fiabilité > coût en phase beta)
- **Fallback : Gemini 2.0 Flash** (cross-provider, déjà déployé)
- Switch possible via secret Supabase `PRIMARY_PROVIDER=gemini` sans redéployer

## TODO
- [ ] Analyser les 24 différences en détail
- [ ] Tester avec un prompt Gemini incluant normalisation de casse
- [ ] Revoir la gestion des photos multi-bouteilles
