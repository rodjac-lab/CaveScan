# Célestin — Architecture cible vs architecture actuelle

Version: 2026-03-16  
Auteur: Buddy  
Base d'analyse: `docs/celestin-architecture.md` du repo CaveScan

---

## 1. Objectif

Ce document propose une **architecture cible** pour Célestin afin de corriger les problèmes observés dans les conversations :

1. le chatbot ne suit pas toujours bien les instructions ;
2. il a du mal à changer de sujet proprement dans une conversation ;
3. il peut répéter ou relancer une tâche déjà terminée ;
4. le mélange entre **chat**, **recommandation** et **action UI** manque de contrôle.

L'idée centrale est simple :

> aujourd'hui, l'architecture repose encore trop sur le LLM pour deviner l'intention exacte du tour.
> demain, l'orchestrateur doit reprendre davantage le contrôle.

---

## 2. Résumé exécutif

### Diagnostic court

L'architecture actuelle est intelligemment construite, mais elle présente une faiblesse structurante :

- un **classifieur d'intent code-side** décide très tôt entre `conversation`, `recommendation` et `unknown` ;
- le **même appel LLM** doit ensuite à la fois converser, raisonner sur le vin, produire un `ui_action` et gérer le ton ;
- le système **n'impose pas assez de garde-fous backend** une fois la réponse générée.

Résultat : sur des tours courts comme `merci`, `super`, `ok`, ou après une image de carte des vins, le modèle peut repartir sur la tâche précédente au lieu de comprendre qu'on est passé sur un simple échange social.

### Recommandation principale

Mettre en place un **orchestrateur conversationnel explicite**, avec :

- un **state machine léger** ;
- une étape séparée de **turn interpretation** avant la génération ;
- une **policy backend** qui autorise ou interdit certaines `ui_action` selon le type de tour ;
- une gestion plus stricte du contexte injecté, surtout après les tours sociaux très courts.

---

## 3. Architecture actuelle — lecture synthétique

### 3.1 Flux actuel simplifié

```text
Utilisateur
  -> Frontend buildRequestBody()
  -> Edge Function
  -> classifyIntent(message, hasImage)
  -> buildSystemPrompt() + buildUserPrompt()
  -> celestinWithFallback()
  -> parseAndValidate()
  -> CelestinResponse { message, ui_action?, action_chips? }
  -> Frontend response routing
```

### 3.2 Ce que fait bien l'architecture actuelle

- Elle injecte beaucoup de contexte utile : cave, profil de goût, questionnaire, souvenirs, sessions précédentes, zones.
- Elle sépare déjà plusieurs briques logiques : `persona`, `rules`, `capabilities`, `wine-codex`, `response-format`.
- Elle a un fallback multi-provider.
- Elle prend en charge le multimodal.
- Elle sait déclencher plusieurs actions UI structurées.

### 3.3 Faiblesses principales

#### A. Le routage d'intention est trop fragile

Le classifieur code-side repose sur une logique simple.
C'est pratique, mais insuffisant pour des tours courts et ambigus :

- `merci`
- `top`
- `ok`
- `et toi ?`
- `super`
- `vas-y`

Ces messages ne peuvent pas être interprétés correctement sans tenir compte du **tour précédent** et de l'**état de la tâche en cours**.

#### B. Pas de véritable état conversationnel pilotant le flux

Le document mentionne une mémoire conversationnelle, mais pas une vraie **machine à états métier** du dialogue.

Autrement dit, le système garde des traces, mais il ne sait pas explicitement dire :

- "on est en train d'aider au restaurant" ;
- "la recommandation vient d'être rendue" ;
- "l'utilisateur a simplement acquitté" ;
- "aucune nouvelle action n'est attendue".

#### C. Le LLM décide encore trop de choses à la fois

Dans la version actuelle, le même appel doit :

- comprendre l'intention ;
- suivre la persona ;
- exploiter le contexte ;
- décider d'une éventuelle action UI ;
- produire le bon ton conversationnel ;
- éviter de répéter une tâche déjà accomplie.

C'est possible, mais fragile.

#### D. Les garde-fous backend sont trop faibles

Même si le prompt dit `PAS de ui_action` pour une conversation, il manque une vraie policy post-génération du type :

- si le tour est social, alors `ui_action = null` quoi qu'ait dit le modèle ;
- si la tâche précédente est terminée et que le message est un simple acquittement, ne surtout pas rouvrir la tâche.

#### E. Trop de contexte est probablement rejoué trop souvent

Pour un simple `merci`, il est très probable que trop de signal soit encore injecté :

- historique enrichi ;
- contexte précédent ;
- éventuellement image précédente ;
- cave et préférences ;
- souvenirs et sessions passées.

Cela pousse le modèle à continuer à "travailler" au lieu de simplement répondre socialement.

---

## 4. Architecture cible proposée

## 4.1 Principe directeur

Le LLM doit rester le meilleur composant pour :

- comprendre le vin ;
- interpréter une carte des vins ;
- produire une recommandation ;
- extraire des informations depuis une photo ;
- rédiger une réponse naturelle.

Mais il ne doit plus être le seul arbitre de :

- l'étape du dialogue ;
- le droit d'émettre une action ;
- la poursuite ou non d'une tâche ;
- la fermeture d'un échange.

### 4.2 Nouveau flux cible

```text
Utilisateur
  -> Frontend buildRequestBody()
  -> Edge Function
  -> Turn Interpreter
       - détecte type de tour
       - regarde l'état courant
       - décide si on continue une tâche ou non
  -> Conversation Policy Engine
       - autorise / interdit ui_action
       - décide du niveau de contexte à injecter
  -> Prompt Builder par mode
       - smalltalk
       - reco cave
       - reco restaurant image
       - encavage
       - dégustation
  -> LLM principal
  -> Response Validator / Policy Enforcer
       - nettoie ou annule ui_action si interdite
       - borne les action_chips
  -> State Transition Manager
       - met à jour l'état conversationnel
  -> Frontend router
```

---

## 5. La pièce maîtresse : un state machine léger

## 5.1 Pourquoi

Le point clé n'est pas de créer une usine à gaz.
Le but est simplement d'éviter de tout redeviner à chaque tour.

### 5.2 États recommandés

```text
IDLE_SMALLTALK
ACTIVE_RECOMMENDATION_CELLAR
ACTIVE_RECOMMENDATION_RESTAURANT
ACTIVE_ADD_TO_CELLAR
ACTIVE_TASTING_LOG
AWAITING_CONFIRMATION
POST_TASK_ACK
DISAMBIGUATION
```

### 5.3 Signification

- `IDLE_SMALLTALK` : discussion légère, sans action attendue.
- `ACTIVE_RECOMMENDATION_CELLAR` : recommandation à partir de la cave de l'utilisateur.
- `ACTIVE_RECOMMENDATION_RESTAURANT` : recommandation à partir d'une carte ou d'un contexte restaurant.
- `ACTIVE_ADD_TO_CELLAR` : extraction / pré-remplissage pour ranger une bouteille.
- `ACTIVE_TASTING_LOG` : préparation d'une note de dégustation.
- `AWAITING_CONFIRMATION` : une action structurée attend une validation.
- `POST_TASK_ACK` : la tâche vient d'être rendue ; on attend potentiellement un simple `merci` ou un changement de sujet.
- `DISAMBIGUATION` : l'utilisateur a parlé, mais il faut lever une ambiguïté.

### 5.4 Exemple de transitions

```text
IDLE_SMALLTALK
  -> ACTIVE_RECOMMENDATION_RESTAURANT     si photo + demande de conseil resto
  -> ACTIVE_RECOMMENDATION_CELLAR         si demande "que boire ce soir ?"
  -> ACTIVE_ADD_TO_CELLAR                 si photo d'étiquette / achat à ranger

ACTIVE_RECOMMENDATION_RESTAURANT
  -> POST_TASK_ACK                        après recommandation rendue
  -> ACTIVE_RECOMMENDATION_RESTAURANT     si nouvelle photo ou précision
  -> IDLE_SMALLTALK                       si simple salut / hors sujet

POST_TASK_ACK
  -> IDLE_SMALLTALK                       si "merci", "top", "super"
  -> ACTIVE_RECOMMENDATION_CELLAR         si nouvelle demande cave
  -> ACTIVE_RECOMMENDATION_RESTAURANT     si nouvelle demande resto
  -> ACTIVE_ADD_TO_CELLAR                 si nouvelle demande d'encavage
```

### 5.5 Ce que ça règle immédiatement

Le cas que tu as décrit devient simple :

1. photo de carte des vins ;
2. Célestin fait sa recommandation ;
3. l'état passe à `POST_TASK_ACK` ;
4. l'utilisateur dit `merci` ;
5. le routeur comprend qu'il s'agit d'un acquittement social ;
6. réponse courte ;
7. pas de nouvelle recommandation ;
8. retour vers `IDLE_SMALLTALK`.


### 5.6 Transitions from Small Talk to Task Execution

Les états conversationnels ne doivent **pas empêcher l’ouverture d’une tâche**.

Même si Célestin est dans `IDLE_SMALLTALK`, un message utilisateur peut introduire
une **intention exécutable**.

Exemple :

Utilisateur :
"J'aime bien le chenin quand il garde de la tension."

Célestin :
"Oui, surtout en Loire..."

Utilisateur :
"Tu peux vérifier si j'en ai en cave ?"

Interprétation :

previous_state = IDLE_SMALLTALK  
turn_type = task_request  
task = cellar_lookup_by_grape

Transition autorisée :

IDLE_SMALLTALK → ACTIVE_RECOMMENDATION_CELLAR

Principe clé :

> Chaque nouveau tour utilisateur peut ouvrir une tâche,
> quel que soit l'état conversationnel précédent.

À chaque message, l’orchestrateur doit arbitrer :

1. Continuer la tâche en cours  
2. Clôturer la tâche  
3. Revenir au small talk  
4. Ouvrir une nouvelle tâche  

Cela garantit une conversation naturelle tout en gardant un contrôle structurel.

---

### 5.7 Hub Conversation Logic

La conversation ne doit pas fonctionner comme un **pipeline linéaire**.

Architecture à éviter :

smalltalk → recommendation → confirmation → end

Architecture recommandée : **hub conversationnel**.

                 +--------------------+
                 |     SMALL TALK     |
                 +--------------------+
                   ↑        ↑        ↑
                   |        |        |
          cellar_lookup  recommendation  add_to_cellar
                   |        |        |
                   ↓        ↓        ↓
                TASK STATES

Chaque nouveau message peut :

- continuer la tâche actuelle
- clôturer la tâche
- revenir au small talk
- ouvrir une nouvelle tâche

Exemples de flux :

smalltalk → cellar lookup  
restaurant analysis → recommendation  
recommendation → add_to_cellar  
task completion → smalltalk

Ce modèle permet des transitions naturelles et évite les blocages
ou les répétitions de tâches.

---

## 6. Séparer interprétation du tour et génération

## 6.1 Aujourd'hui

L'intent classifier et le prompt de génération sont trop liés.

## 6.2 Cible

Créer une étape intermédiaire : **Turn Interpreter**.

### Sortie attendue du Turn Interpreter

```ts
interface TurnInterpretation {
  turnType:
    | 'greeting'
    | 'social_ack'
    | 'smalltalk'
    | 'task_start_recommendation_cellar'
    | 'task_start_recommendation_restaurant'
    | 'task_start_add_to_cellar'
    | 'task_continue'
    | 'task_confirm'
    | 'task_cancel'
    | 'disambiguation_needed'
    | 'unknown';

  currentTask:
    | 'none'
    | 'recommendation_cellar'
    | 'recommendation_restaurant'
    | 'add_to_cellar'
    | 'tasting_log';

  continueCurrentTask: boolean;
  shouldAllowUiAction: boolean;
  shouldReuseLastImage: boolean;
  promptMode:
    | 'smalltalk'
    | 'recommendation_cellar'
    | 'recommendation_restaurant'
    | 'add_to_cellar'
    | 'tasting_log'
    | 'disambiguation';
}
```

### Bénéfices

- On traite `merci` comme un **type de tour**, pas comme juste un mot-clé.
- On distingue mieux **continuer une tâche** vs **clore la tâche**.
- On décide explicitement si une image précédente peut encore être utile.
- On simplifie fortement les prompts.

---

## 7. Ajouter une policy backend sur les actions UI

## 7.1 Règle d'or

Le backend doit pouvoir dire :

> même si le modèle a proposé une action, je ne l'autorise pas dans ce contexte.

### Exemple de policy

```ts
function enforceUiPolicy(
  interpretation: TurnInterpretation,
  response: CelestinResponse,
): CelestinResponse {
  if (!interpretation.shouldAllowUiAction) {
    return {
      ...response,
      ui_action: undefined,
      action_chips: sanitizeSocialChips(response.action_chips),
    };
  }

  return response;
}
```

### Cas où `shouldAllowUiAction = false`

- `social_ack`
- `greeting`
- petit smalltalk
- message purement phatique
- après tâche terminée sans nouvelle demande

### Effet produit

Même si le LLM "redémarre" une recommandation, le backend bloque l'action.

---

## 8. Réduire le contexte injecté selon le mode

## 8.1 Problème actuel

Le système actuel injecte beaucoup de contexte quel que soit le tour.

## 8.2 Cible

Avoir plusieurs **niveaux de contexte**.

### Niveau A — Smalltalk minimal

À utiliser pour :

- salut ;
- merci ;
- ça va ;
- top ;
- super ;
- de rien ;
- ok.

Contexte injecté :

- dernier état ;
- dernier task summary très court ;
- aucun replay image ;
- aucune cave complète ;
- pas de sessions anciennes détaillées.

### Niveau B — Task continuation light

À utiliser si on poursuit une tâche déjà active.

Contexte injecté :

- résumé de la tâche en cours ;
- dernier échange ;
- éventuellement la dernière image si explicitement utile.

### Niveau C — Full task context

À utiliser pour une vraie demande métier :

- recommandation cave ;
- recommandation restaurant ;
- encavage ;
- dégustation.

Contexte injecté :

- cave triée ;
- préférences ;
- souvenirs ;
- métadonnées utiles ;
- image si présente.

### Bénéfice

Le modèle arrête d'être "sur-alimenté" pour un simple acquittement.

---

## 9. Découper les prompts par mode

## 9.1 Aujourd'hui

Le system prompt est riche et bien pensé, mais trop transversal.

## 9.2 Cible

Garder un noyau commun, puis des prompts spécialisés.

### Prompt modes recommandés

1. `smalltalk`
2. `recommendation_cellar`
3. `recommendation_restaurant`
4. `add_to_cellar`
5. `tasting_log`
6. `disambiguation`

### Règle importante

Le prompt smalltalk doit être extrêmement simple.

Exemple d'intention :

```text
Tu es Célestin.
Tour purement social.
Réponds en une phrase courte et naturelle.
N'émet aucune ui_action.
Ne relance pas la tâche précédente.
Ne propose rien sauf si l'utilisateur demande explicitement.
```

### Bénéfice

On remplace un gros compromis par plusieurs prompts beaucoup plus stables.

---

## 10. Clarifier la gestion des images

## 10.1 Problème

Dans les conversations multimodales, une image de carte des vins peut rester trop présente dans le contexte et influencer les tours suivants.

## 10.2 Cible

Introduire une politique de réutilisation explicite :

```ts
shouldReuseLastImage: boolean
```

### Règles proposées

- `false` pour `merci`, `super`, `ok`, `ça va`, `bien vu`.
- `true` si l'utilisateur dit :
  - `et pour le dessert ?`
  - `dans cette carte, tu vois un blanc sec ?`
  - `sur la photo, lequel tu préfères ?`
- `false` par défaut si le tour n'évoque pas clairement l'image précédente.

### Effet

Le modèle n'est plus tenté de continuer à analyser une carte alors que l'utilisateur a déjà clos l'échange.

---

## 11. Refondre légèrement le fallback provider

## 11.1 Problème

Aujourd'hui, les providers reconstruisent chacun l'historique dans leur format.
Cela peut créer des écarts de comportement.

## 11.2 Cible

- Garder un provider principal pour le comportement conversationnel.
- Utiliser le fallback principalement pour :
  - timeouts ;
  - erreurs API ;
  - échec de parsing ;
  - indisponibilité provider.
- Éviter les bascules invisibles qui changent le style ou l'obéissance aux consignes sans contrôle.

### Recommandation

Normaliser davantage l'entrée et la sortie si tu gardes le multi-provider.

---

## 12. Observabilité : logs à ajouter absolument

Pour stabiliser Célestin, il faut rendre le flux observable.

### Log recommandé par tour

```ts
interface TurnDebugLog {
  message: string;
  hasImage: boolean;
  previousState: string;
  interpretedTurnType: string;
  promptMode: string;
  shouldAllowUiAction: boolean;
  shouldReuseLastImage: boolean;
  chosenProvider: string;
  rawUiActionKind?: string;
  finalUiActionKind?: string;
  stateAfterTurn: string;
}
```

### Pourquoi c'est essentiel

Quand Célestin se comporte mal, tu pourras enfin savoir si le problème vient de :

- l'interprétation du tour ;
- le prompt mode ;
- le provider ;
- la policy d'action ;
- la transition d'état.

---

## 13. Comparaison structurée — actuel vs cible

| Sujet | Architecture actuelle | Architecture cible |
|---|---|---|
| Pilotage du dialogue | Intention classée tôt, puis beaucoup laissé au LLM | Orchestrateur explicite avec état + policy |
| Gestion de `merci` / `ok` / `super` | Regex + prompt hint | `turnType = social_ack`, règle dure, pas d'action |
| Continuité conversationnelle | Déduite implicitement de l'historique | Gérée explicitement par transitions d'état |
| `ui_action` | Décidée principalement par le modèle | Autorisée ou bloquée par policy backend |
| Gestion des images | Réinjectées via historique provider | Réutilisation explicite et contrôlée |
| Prompts | Un gros assemblage transversal | Prompts spécialisés par mode |
| Robustesse aux changements de sujet | Moyenne | Nettement meilleure |
| Coût cognitif pour le modèle | Élevé | Plus ciblé et plus léger |
| Débogage | Possible mais partiel | Beaucoup plus lisible |
| Risque de répétition après tâche | Réel | Fortement réduit |

---

## 14. Impact sur tes 3 use cases

## 14.1 Recommandation dans la cave pour le dîner

### Aujourd'hui

Le système marche probablement assez bien quand la demande est explicite.
Le risque apparaît surtout après la recommandation : re-relance inutile, mauvaise interprétation d'un message court, ou mélange smalltalk / action.

### Avec l'architecture cible

- entrée dans `ACTIVE_RECOMMENDATION_CELLAR` ;
- rendu de la reco ;
- passage à `POST_TASK_ACK` ;
- si l'utilisateur dit `merci`, réponse courte ;
- si l'utilisateur dit `et en blanc ?`, continuation de tâche.

## 14.2 Photo d'une carte des vins au restaurant

### Aujourd'hui

C'est le use case le plus sensible, car la photo donne beaucoup d'inertie au contexte.

### Avec l'architecture cible

- entrée dans `ACTIVE_RECOMMENDATION_RESTAURANT` ;
- image traitée uniquement tant qu'elle reste pertinente ;
- après la reco, état `POST_TASK_ACK` ;
- sur `merci`, on coupe la continuité de tâche ;
- aucune nouvelle reco n'est générée sans nouvelle demande explicite.

## 14.3 J'ai acheté du vin, range-le dans ma cave

### Aujourd'hui

La frontière entre extraction, conversation et navigation UI est un peu trop fusionnée.

### Avec l'architecture cible

on peut séparer clairement :

1. extraction ;
2. éventuelle clarification ;
3. préparation de l'action ;
4. confirmation ;
5. retour au smalltalk.

Cela rend l'expérience plus propre et réduit les actions prématurées.

---

## 15. Proposition d'implémentation incrémentale

## Phase 1 — Quick wins (faible coût, fort ROI)

1. Ajouter `shouldAllowUiAction`.
2. Bloquer `ui_action` pour `greeting`, `social_ack`, `smalltalk`.
3. Ne pas rejouer image + full context sur les acquittements courts.
4. Introduire `POST_TASK_ACK`.
5. Logger `previousState` et `stateAfterTurn`.

### Effet attendu

Tu réduis déjà une bonne partie du bug `merci -> il recommence`.

## Phase 2 — Refonte du routeur en orchestrateur

1. Créer `TurnInterpretation`.
2. Remplacer `classifyIntent()` par une logique tenant compte du contexte conversationnel.
3. Introduire les prompt modes spécialisés.
4. Mettre en place les transitions d'état.

### Effet attendu

Célestin devient plus stable dans les changements de sujet et les enchaînements fluides.

## Phase 3 — Stabilisation produit

1. Réduire le rôle du fallback invisible.
2. Normaliser davantage les entrées/sorties providers.
3. Ajouter métriques et dashboards de qualité.
4. Tester systématiquement les patterns conversationnels courts.

---

## 16. Schéma cible détaillé

```text
╔══════════════════════════════════════════════════════════════╗
║                        FRONTEND (React)                     ║
║                CeSoirModule.tsx + UI Router                 ║
╚══════════════════════════════════════════════════════════════╝
  User message (+ image optionnelle)
        │
        ▼
  buildRequestBody()
        │
        ├─ message
        ├─ history summary
        ├─ cave / profile / memories (si nécessaire)
        └─ image
        │
        ▼
╔══════════════════════════════════════════════════════════════╗
║                    EDGE FUNCTION / ORCHESTRATOR             ║
╚══════════════════════════════════════════════════════════════╝
        │
        ▼
  1. LoadConversationState()
        │
        ▼
  2. TurnInterpreter()
        │   -> turnType
        │   -> currentTask
        │   -> continueCurrentTask?
        │   -> shouldAllowUiAction?
        │   -> shouldReuseLastImage?
        │   -> promptMode
        │
        ▼
  3. PolicyEngine()
        │   -> context level (minimal / light / full)
        │   -> allowed ui actions
        │
        ▼
  4. PromptBuilderByMode()
        │   -> smalltalk prompt
        │   -> cellar recommendation prompt
        │   -> restaurant recommendation prompt
        │   -> add-to-cellar prompt
        │   -> tasting-log prompt
        │
        ▼
  5. LLM Provider
        │
        ▼
  6. ResponseValidator()
        │   -> parse JSON
        │   -> enforce ui policy
        │   -> sanitize action chips
        │
        ▼
  7. StateTransitionManager()
        │   -> nextState
        │   -> task summary update
        │
        ▼
  8. Return CelestinResponse
        │
        ▼
╔══════════════════════════════════════════════════════════════╗
║                      FRONTEND RESPONSE                      ║
╚══════════════════════════════════════════════════════════════╝
        ├─ show_recommendations
        ├─ prepare_add_wine(s)
        ├─ prepare_log_tasting
        └─ message-only response
```

---

## 17. Recommandation finale

Je ne recommande pas une réécriture totale.
Je recommande un **refactor architectural ciblé**.

### En une phrase

> Le bon move n'est pas de rendre Célestin "plus intelligent" par le prompt seul, mais de rendre son orchestration plus explicite, plus déterministe et plus disciplinée.

### Priorité absolue

Si tu dois commencer ce soir par une seule chose :

1. introduis `POST_TASK_ACK` ;
2. ajoute une policy backend qui bloque `ui_action` sur les tours sociaux ;
3. n'injecte plus l'image précédente ni le full context pour un simple `merci`.

C'est le meilleur ratio effort / impact.

---

## 18. Annexe — pseudo-code minimal

```ts
function handleTurn(body: RequestBody, state: ConversationState): CelestinResponse {
  const interpretation = interpretTurn(body, state);
  const policy = derivePolicy(interpretation, state);
  const prompt = buildPromptByMode(body, state, interpretation, policy);

  const rawResponse = callPrimaryLLM(prompt);
  const parsed = parseAndValidate(rawResponse);
  const guarded = enforceUiPolicy(interpretation, parsed);

  const nextState = transitionState(state, interpretation, guarded);
  persistState(nextState);

  return guarded;
}
```

### Exemple de transition simple

```ts
function transitionState(
  prev: ConversationState,
  interpretation: TurnInterpretation,
  response: CelestinResponse,
): ConversationState {
  if (interpretation.turnType === 'social_ack') {
    return { mode: 'IDLE_SMALLTALK' };
  }

  if (response.ui_action?.kind === 'show_recommendations') {
    return { mode: 'POST_TASK_ACK', lastTask: 'recommendation' };
  }

  return prev;
}
```

---

## 19. Conclusion

L'architecture actuelle de Célestin est déjà bonne pour un prototype ambitieux.
Mais pour atteindre l'expérience produit que tu vises — fluide, naturelle, capable de mêler chat et action sans confusion — il faut sortir d'un modèle où le LLM est à la fois :

- interprète du tour,
- chef d'orchestre,
- moteur métier,
- décideur d'action.

L'architecture cible proposée redonne au backend le rôle d'orchestrateur.
C'est exactement ce qui manque pour supprimer les répétitions, améliorer les changements de sujet et rendre le dialogue plus propre.
