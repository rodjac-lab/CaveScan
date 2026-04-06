# Celestin Memory Policy Matrix

## Pourquoi

Avant de supprimer des briques mémoire ou d'ajouter `autodream`, on veut pouvoir tester plusieurs hiérarchies de mémoire par type de tour.

Le but n'est pas de rendre le système plus complexe. Le but est de rendre explicite et testable ce qui était jusqu'ici implicite :

- quelles couches mémoire sont autorisées
- dans quel ordre elles parlent
- sur quels tours elles doivent se taire

Cette matrice sert directement les chantiers `1 à 3` :

1. hiérarchie mémoire par type de tour
2. réduction de la concurrence entre couches
3. evals comparatives par politique mémoire

## Principe

Une politique mémoire est un objet versionné dans [shared/celestin/memory-policy.js](/home/rodol/work/CaveScan/shared/celestin/memory-policy.js).

Elle définit, pour chaque profil de tour :

- `layerPriority`
- `includeResolvedUserModel`
- `includeMemoryFactsFallback`
- `includeRetrievedConversation`
- `includeTastingMemories`
- `includePreviousSessionText`

Le backend résout ensuite dynamiquement le profil du tour à partir de :

- `turn-interpreter`
- `conversationState`
- `inferredTaskType`

Le résultat pilote la construction du contexte dans [supabase/functions/celestin/index.ts](/home/rodol/work/CaveScan/supabase/functions/celestin/index.ts).

## Couches pilotées

- `resolvedUserModel`
  Usage: portrait synthétique des goûts et signaux utilisateurs.
- `memoryFactsFallback`
  Usage: facts bruts si le resolver ne produit rien.
- `retrievedConversation`
  Usage: rappel d'une conversation passée explicitement pertinente.
- `tastingMemories`
  Usage: souvenirs de dégustation et moments marquants.
- `previousSessionText`
  Usage: continuité légère avec la session précédente.

## Profils de tour

- `greeting`
- `social`
- `wine_conversation`
- `tasting_memory`
- `recommendation`
- `encavage`
- `cellar_lookup`
- `restaurant_assistant`

Ces profils sont plus stables que les prompts eux-mêmes et servent de point de contrôle pour l'orchestration mémoire.

## Politiques V1

### `balanced_v1`

Politique par défaut.

- Recommandation: profil résolu d'abord, souvenirs ensuite.
- Souvenir: conversation récupérée puis mémoire épisodique.
- Encavage: mémoire minimale.

Usage attendu: baseline produit raisonnable.

### `lean_reco_v1`

Politique conservative sur la recommandation.

- Pas de souvenirs épisodiques en recommendation.
- Pas de continuité de session en recommendation.

Usage attendu: vérifier si une reco plus sobre est plus fiable.

### `episodic_first_v1`

Politique agressive sur la mémoire épisodique.

- Souvenirs de dégustation prioritaires sur les tours mémoire.
- Souvenirs plus présents en conversation vin.

Usage attendu: tester si le gain de personnalisation compense le risque de faux rappel.

## Règles de décision

Cette matrice n'est pas un framework général. C'est un outil de comparaison produit.

Les règles à suivre :

- mieux vaut sous-injecter que sur-injecter
- mieux vaut oublier que se tromper
- en recommandation, la mémoire doit soutenir le conseil, pas l'encombrer
- les souvenirs marquants doivent rester rares et fortement pertinents
- la continuité conversationnelle ne dépend pas seulement de la mémoire

## Evals

Le script [scripts/evaluate-celestin.mjs](/home/rodol/work/CaveScan/scripts/evaluate-celestin.mjs) accepte maintenant :

- `--memory-policy <id>`
- `--all-memory-policies`
- `--list-memory-policies`

Exemples :

```bash
npm run eval:celestin -- --memory-policy balanced_v1
npm run eval:celestin -- --memory-policy lean_reco_v1
npm run eval:celestin -- --all-memory-policies
```

Chaque run écrit un rapport dédié par politique mémoire.

## Ce qu'on ne fait pas encore

- pas de suppression de briques mémoire
- pas d'auto-sélection de politique en prod
- pas d'UI de configuration
- pas d'`autodream` V1

On commence par comparer, mesurer et comprendre.

## Étape suivante

Après quelques runs comparatifs, on décidera :

- si `resolvedUserModel` apporte réellement un gain
- si `previousSessionText` pollue certains tours
- si les souvenirs en recommendation doivent être réduits
- quelles briques peuvent être simplifiées ou retirées avant `autodream`
