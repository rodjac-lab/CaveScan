# Celestin V2 — état dogfood au 2026-05-17

> Statut : V2 prête pour dogfood personnel limité, derrière opt-in.
> V1 reste le défaut produit.
> Derniers commits structurants : `c49914c`, `f23cbe2`, `e659bf3`.

## Résumé

Celestin V2 est toujours une orchestration expérimentale, mais elle a dépassé le stade du simple prototype scorecard.

Les corrections récentes ont porté sur quatre axes :

1. **RECOMMEND moins agressif** : une demande vague peut clarifier sans cartes.
2. **FACTS plus sûr** : les faits personnels doivent être sourcés, pas inventés.
3. **Mémoire conversationnelle personnelle** : les relances courtes restent dans le bon fil quand le sujet est personnel.
4. **Dogfood réel** : activation V2 côté utilisateur via `/debug`, avec observabilité et conversations persistées.

Le but immédiat n’est pas encore de basculer tout le produit en V2. Le but est de dogfooder sur compte personnel et de voir si V2 apporte une meilleure expérience sans devenir plus fragile.

## Activation dogfood

V2 reste désactivée par défaut.

Pour dogfood :

- aller dans `/debug` ;
- activer le toggle V2 ;
- les requêtes partent avec `orchestrationVersion: 'v2'` ;
- `requestSource` devient `dogfood_v2`.

Les conversations normales sont persistées dans `chat_sessions` / `chat_messages`. Les tours Celestin sont observables dans `celestin_turn_observability`.

## Changements V2 récents

### RECOMMEND readiness

V2 expose maintenant `recommendationReady`.

Principe :

- `capability = RECOMMEND` et `recommendationReady = false` :
  - `responseMode = clarification` ;
  - pas d’obligation de `recommendation_selection` ;
  - pas de backfill de cartes ;
  - pas de `ui_action.show_recommendations`.
- `capability = RECOMMEND` et `recommendationReady = true` :
  - `responseMode = closed_choice` ;
  - shortlist backend ;
  - sélection fermée ;
  - cartes matérialisées.

Exemples pas prêts :

- `Je cherche un vin pour ce soir`
- `Qu'est-ce que j'ouvre ?`
- `Que boire ce soir ?`

Exemples prêts :

- `avec un poulet rôti`
- `pour une pizza`
- `pour une raclette`
- `un rouge léger`
- `un blanc sec`
- refinement après reco : `en blanc plutôt ?`, `un autre rouge ?`

### FACTS personnels sourcés

Les routes `memory_lookup` et `tasting_log` utilisent maintenant une politique `force_personal`.

Ce n’est pas `force_tastings`. Le LLM doit utiliser une source personnelle active, mais cette source peut être :

- `query_tastings` ;
- `query_memory` ;
- un profil compilé réellement fourni au contexte ;
- l’historique récent explicite.

Règle produit : ne pas affirmer un nom de vin, une dégustation, une note ou une préférence personnelle absent des sources.

### État conversationnel personnel

Un nouveau `taskType = personal_fact` permet de garder le fil sur les relances courtes.

Exemple visé :

1. `Quelle est la région que j’ai le plus dégustée ?`
2. Celestin répond depuis les dégustations.
3. `Et champagne ?`
4. Le tour reste dans le contexte `tasting_log`/fait personnel, au lieu de retomber en culture vin générique.

Ce mécanisme n’est pas codé autour de Selosse, Krug, Henriot, Gangloff ou Jamet. Il est lié à l’état conversationnel et aux sources.

### Agrégats backend

Les questions statistiques de dégustation ne doivent pas être résolues par intuition LLM.

Ajout des agrégats :

- `top_region`
- `top_appellation`
- `top_domaine`

Exemple :

- `Quelle est la région que j’ai le plus dégustée ?`

Le backend groupe les dégustations et fournit `topRows`. Le LLM ou la réponse déterministe ne doit répondre qu’à partir de ces lignes.

### Identité canonique du vin

Ajout de `shared/celestin/wine-identity.ts`.

Objectif : éviter de lire deux fois le même vin sous deux angles différents.

Exemple dogfood :

- `Sandlands`
- `Trousseau de Sonoma`

Ces deux formulations peuvent pointer vers la même dégustation. L’identité canonique combine producteur, cuvée, appellation et millésime quand disponibles.

## Scorecard actuel

Dernier run V2 authentifié notable :

- rapport : `evals/results/scorecard-v2-2026-05-17T12-23-15-295Z.md`
- orchestration : `v2`
- dogfood set : exclu
- compte : `213e0662-2a6a-4868-957b-bbab982b342f`
- réponses scorées : `82`
- score global : `99,5%`
- latence p50 globale : `2080 ms`

Par capacité :

| Capacité | Réponses | Échecs | Fallback | Provider errors | p50 |
|---|---:|---:|---:|---:|---:|
| RECOMMEND | 30 | 0 | 3 | 0 | 3960 ms |
| CHAT | 31 | 2 | 0 | 0 | 3106 ms |
| ACTIONS | 5 | 0 | 0 | 0 | 459 ms |
| FACTS | 16 | 0 | 0 | 0 | 509 ms |

Les deux échecs restants sont des réponses `CHAT` trop longues sur le Jura / vin jaune.

Critères ajoutés ou durcis :

- `c5_reco_clarification_no_cards`
- `c6_fact_direct_answer_gate`
- `c7_action_clarification_no_ui`
- `c8_expected_route_contract`
- `c9_expected_response_content`

Ces critères ont rendu le scorecard plus utile : il ne vérifie plus seulement que la réponse est non vide et polie, il vérifie aussi que le routage et le contenu attendu sont cohérents.

## Dogfood observé

Signaux positifs :

- V2 utilise parfois la mémoire personnelle avec une intimité réellement utile.
- Les faits simples peuvent descendre à ~500 ms quand ils sont déterministes.
- Les recos ambiguës ne doivent plus forcer des cartes.
- Les relances personnelles courtes sont mieux tenues.

Risques encore ouverts :

- `CHAT` peut rester trop long sur des sujets culturels.
- Les questions personnelles très ouvertes peuvent encore dépendre du bon choix entre `query_tastings` et `query_memory`.
- Le `User Model / User Graph` n’existe pas encore comme vraie couche produit. Les préférences de proches (`Marc n’aime pas les tanins`) et les traits durables (`j’aime l’acidité sur les blancs`) restent une tâche post-V2.
- Les accords mets-vins bidirectionnels (`plat -> vin`, `vin -> plat`) méritent une capacité dédiée post-V2.

## Changements hors V2 qui affectent le dogfood

Le 2026-05-17, un durcissement Supabase Storage a été appliqué après warnings Advisor :

- bucket `wine-labels` plus listable/modifiable/supprimable publiquement ;
- uploads nouveaux sous `auth.uid()/...` ;
- policies `authenticated` limitées ;
- grants RPC durcis ;
- historique migrations Supabase réaligné.

Effet de bord corrigé :

- des clients PWA pouvaient encore avoir l’ancien bundle qui uploadait à la racine du bucket ;
- l’upload échouait ;
- le flow Dégustation créait une fiche sans photo en silence.

Corrections :

- `b5186a8` : ne plus perdre silencieusement une photo de dégustation ;
- `e659bf3` : distinguer `photoSource = camera | gallery`.

Règle produit photo :

- photo depuis galerie : message clair, réessayer ou continuer sans photo ;
- photo depuis appareil dans l’app : blocage par défaut, car la photo peut être perdue ;
- jamais de sauvegarde silencieuse sans photo quand la photo faisait partie du flow.

Ce sujet est **storage/photo**, pas Celestin V2.

## Décision actuelle

Ne pas lancer le gros refactor Celestin immédiatement.

Plan recommandé :

1. dogfood personnel court et discipliné ;
2. noter les ratés importants ;
3. faire un audit léger ciblé ;
4. si V2 reste stable, lancer ensuite le refactor/clean de maintenabilité.

Critère de passage au refactor :

> V2 doit tenir quelques sessions dogfood sans incident bloquant de routage, mémoire personnelle, recommandation ou action.
