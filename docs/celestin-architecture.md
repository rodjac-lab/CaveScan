# Architecture Celestin

Celestin est le sommelier IA de l'app. Ce document decrit comment un message utilisateur est traite, du tap sur "Envoyer" jusqu'a la reponse affichee.

> Note
> Cette doc reste la reference pour l'orchestrateur Celestin, le Turn Interpreter, le state machine et le runtime conversationnel.
> Pour l'architecture memoire cible, lire en priorite :
> - `docs/celestin-memory-doctrine.md`
> - `docs/celestin-memory-runtime-architecture.md`
> - `docs/celestin-memory-compilation-events.md`
>
> Important : les sections de ce document qui parlaient de `resolvedUserModel`, `memory policy`,
> `previousSessionSummaries` et `retrievedConversation` ne sont plus l'architecture active.
> Le runtime memoire actuel est plus simple :
> - profil compile utilisateur
> - tools factuels Claude pour cave/degustations/memoire conversationnelle exacte
> - tasting memories ciblees seulement quand elles apportent de la texture
> - cave
> - history courte + conversation state

## Vue d'ensemble : deux axes orthogonaux

L'architecture repose sur deux dimensions independantes :

- **State Machine** (6 etats) = **OU** on est dans le dialogue
- **Cognitive Mode** (4 modes + greeting/social) = **COMMENT** le LLM doit penser

Un meme etat `active_task` peut etre en mode `cellar_assistant` OU `restaurant_assistant`. Les deux axes sont independants.

```
  State Machine (dialogue)         Cognitive Mode (pensee)
  ─────────────────────────        ────────────────────────
  idle_smalltalk                   wine_conversation
  active_task                      cellar_assistant
  post_task_ack                    restaurant_assistant
  collecting_info                  tasting_memory
  disambiguation                   greeting
  context_switch                   social
```

## Flux complet

```
+================================================================+
|                      FRONTEND (React)                           |
|      CeSoirModule.tsx + celestinConversation/celestinChatRequest |
+================================================================+

  User tape un message (+ photo optionnelle)
       |
       v
  prepareCelestinRequest()
       |
       +-- chemin backend_managed :
       |     +-- pas de cave/profil/memoire legacy charges cote frontend
       +-- chemin legacy :
       |     +-- buildMemoryEvidenceBundle() + getCompiledUserProfileCached()
       |
       v
  buildCelestinRequestBody()
       |
       +-- backend_managed par defaut     --> message, history, state, image?
       +-- legacy seulement si necessaire --> tasting/anciens flows non migres
       |
       v
  RequestBody = {
    message, history[], image?,
    conversationState?,
    contextStrategy: "backend_managed",
    requestSource?, sessionId?, debugTrace?
  }
       |
       v  HTTP POST --> supabase.functions.invoke('celestin')

+================================================================+
|              EDGE FUNCTION  celestin/index.ts                   |
+================================================================+
       |
       v
  +----------------------------------------------+
  | Turn Interpreter (turn-interpreter.ts)       |  <-- CODE, pas de LLM
  |                                              |
  | Inputs :                                     |
  |   message + hasImage + conversationState     |
  |   + lastAssistantText                        |
  |                                              |
  | Outputs :                                    |
  |   turnType      (QUOI faire)                 |
  |   cognitiveMode (COMMENT penser)             |
  |   shouldAllowUiAction (garde-fou)            |
  |   inferredTaskType (reco/encavage/tasting)   |
  +--------------------+-------------------------+
                       |
          +------------+------------+
          v                         v
  buildContextBlock(              buildUserPrompt(
    body, cognitiveMode)            body, interpretation, state)
          |                         |
          |  Contexte adapte        |  Prompt adapte
          |  au mode cognitif       |  au type de tour
          |                         |
          v                         v
  +----------------------------------------------+
  |           SYSTEM PROMPT (assemble)           |
  |                                              |
  |  1. WINE_CODEX        (wine-codex.ts)        |
  |  2. CELESTIN_PERSONA  (persona.ts)           |
  |  3. CELESTIN_CAPABILITIES (capabilities.ts)  |
  |  4. CELESTIN_RULES    (rules.ts)             |
  |  5. CELESTIN_RESPONSE_FORMAT                 |
  |     (response-format.ts)                     |
  |                                              |
  |  --- CONTEXTE UTILISATEUR ---                |
  |  (adapte par cognitiveMode, voir tableau)    |
  +--------------------+-------------------------+
                       |
                       v
  +----------------------------------------------+
  |       celestinWithFallback()                 |
  |                                              |
  |  Provider 1: Claude Haiku 4.5 (Anthropic)   |
  |       | fail?                                |
  |  Provider 2: Gemini 2.5 Flash (Google)      |
  |       | fail?                                |
  |  Provider 3: GPT-4.1 mini (OpenAI)          |
  |                                              |
  |  Claude peut appeler des outils internes     |
  |  user-scopes (query_cellar, query_tastings,  |
  |  query_memory) avant sa reponse finale.      |
  |                                              |
  |  Chaque provider :                           |
  |  1. Envoie system prompt + contexte          |
  |  2. Reconstruit history[] en format natif    |
  |  3. Ajoute userPrompt comme dernier message  |
  |  4. Claude seulement : tool_use max 1 round  |
  |  5. Parse JSON --> CelestinProviderResponse  |
  |  6. Normalise trace via ProviderAdapter      |
  +--------------------+-------------------------+
                       |
                       v
  +----------------------------------------------+
  |       materializeRecommendationAction()       |
  |                                              |
  |  Le modele choisit les bouteilles dans        |
  |  recommendation_selection. Le backend resout  |
  |  les bottle_id, deduplique et construit       |
  |  ui_action.show_recommendations.             |
  +--------------------+-------------------------+
                       |
                       v
  +----------------------------------------------+
  |       applyResponsePolicy()                  |
  |                                              |
  |  Garde-fous deterministes post-LLM :         |
  |  - shouldAllowUiAction=false --> strip        |
  |  - Re-reco sur message court --> strip        |
  |  - Extraction incomplete --> strip            |
  +--------------------+-------------------------+
                       |
                       v
  +----------------------------------------------+
  |       computeNextState()                     |
  |                                              |
  |  State Machine : calcule l'etat suivant      |
  |  en fonction du turnType + reponse LLM       |
  +--------------------+-------------------------+
                       |
                       v
  Response = {
    message: "Bonne idee le Morgon !",
    recommendation_selection?: [...],
    ui_action?: { kind, payload },
    action_chips?: ["Et en blanc ?", "Autre plat"],
    _nextState: { phase, taskType, ... }  <-- pour le frontend
  }
       |
       v  HTTP 200 + JSON

+================================================================+
|       RESPONSE ROUTING (CeSoirModule.tsx + chat helpers)         |
+================================================================+
       |
       +-- _nextState
       |   --> persistedConversationState = _nextState
       |
       +-- show_recommendations
       |   --> affiche cartes backend + action_chips
       |   --> resolveBottleIds reste un filet legacy frontend
       |
       +-- prepare_add_wine
       |   --> affiche fiche vin inline (Valider/Modifier)
       |
       +-- prepare_add_wines
       |   --> navigate('/add', { prefillBatchExtractions })
       |
       +-- prepare_log_tasting
       |   --> affiche fiche degustation inline
       |
       +-- (pas de ui_action)
           --> affiche message texte + action_chips
```

Note :
- l'ordre reel est : `Turn Interpreter` -> `buildContextBlock()` / `buildUserPrompt()` -> appel LLM
- le runtime memoire actif n'utilise plus de `User Model Resolver`

## Turn Interpreter : le cerveau du routing

Le Turn Interpreter (`turn-interpreter.ts`) remplace l'ancien `classifyIntent()`. Il utilise le **message**, l'**etat courant**, et le **dernier texte assistant** pour produire une interpretation riche.

### Routing image

Quand `hasImage === true`, le Turn Interpreter route selon le contenu du message :

| Condition message | turnType | cognitiveMode | inferredTaskType |
|-------------------|----------|---------------|------------------|
| `/carte\|resto\|restaurant\|menu\|ardoise/i` | task_request | restaurant_assistant | — |
| Match ENCAVAGE patterns | task_request | cellar_assistant | encavage |
| Match RECOMMENDATION patterns | task_request | cellar_assistant | recommendation |
| Match QUESTION / WINE_CULTURE / opinion | smalltalk | wine_conversation | — (no ui_action) |
| Défaut (aucun match) | task_request | cellar_assistant | — |

### Logique par etat

```
Si state === post_task_ack :
  - message court/social ("merci") --> social_ack, mode: social
  - raffinement ("en blanc")       --> task_continue, mode: herite du taskType
  - sujet different                --> context_switch, mode: detecte

Si state === collecting_info :
  - "non merci"                    --> task_cancel, mode: social
  - autre message                  --> task_continue (reponse a la question)

Si state === active_task :
  - social ack                     --> social_ack, retour idle
  - continuation                   --> task_continue

Si state === idle_smalltalk :
  - "que boire ce soir"            --> task_request, mode: cellar_assistant
  - image                          --> task_request, mode: cellar/restaurant
  - "c'est quoi le chenin"         --> smalltalk, mode: wine_conversation
  - "tu te souviens du Sancerre"   --> context_switch, mode: tasting_memory
  - "j'ai achete du vin"           --> task_request, mode: cellar_assistant
  - message court/ambigu           --> smalltalk, mode: wine_conversation
```

### Backward compatibility

Quand le frontend n'envoie pas `conversationState` (ancien code), le backend voit `idle_smalltalk`. Le Turn Interpreter utilise alors `lastAssistantText` comme fallback (ex: detecte `[Vins proposes]` pour savoir si un raffinement est pertinent).

## State Machine : 6 etats

```
              +---------------------+
              |   IDLE_SMALLTALK    | <-- point de retour naturel
              +---------------------+
                ^       ^       ^
                |       |       |
     context_   |  post_|  disamb|iguation
     switch     |  task_|  resolue
                |  ack   |       |
                v       v       v
         +----------+  +------------+  +----------------+
         | CONTEXT  |  | ACTIVE     |  | DISAMBIGUATION |
         | SWITCH   |  | TASK       |  |                |
         +----------+  +------------+  +----------------+
                        ^       |
                        |       v
                   +----------------+
                   | COLLECTING     |
                   | INFO           |
                   +----------------+
                        |
                        v
                   +----------------+
                   | POST_TASK      |
                   | ACK            |
                   +----------------+
```

### Transitions principales

| Depuis | Evenement | Vers |
|--------|-----------|------|
| idle | task_request + response avec ui_action | post_task_ack |
| idle | task_request + response sans ui_action | collecting_info |
| post_task_ack | social_ack ("merci") | idle |
| post_task_ack | task_continue ("en blanc") | active_task |
| post_task_ack | context_switch | idle |
| collecting_info | response avec ui_action | post_task_ack |
| collecting_info | task_continue | collecting_info |
| active_task | context_switch / social_ack | idle |
| any | task_cancel ("non merci") | idle |
| any | 3 tours sans activite | idle (auto-reset) |

## Cognitive Modes : contexte adapte

Chaque cognitive mode determine **quelles donnees** sont envoyees au LLM et **quel prompt hint** est ajoute.

### Contexte injecte par mode

| Cognitive Mode | Contexte envoye | Tokens estimes |
|----------------|-----------------|----------------|
| `greeting` / `social` | Profil compile minimal + cave count, sans retrieval memoire si message social evident | ~250 |
| `wine_conversation` | Profil compile + cave count + souvenirs ciblés si signal vin/memoire pertinent | ~500-1500 |
| `cellar_assistant` | Cave resumee/triee + profil compile + zones + tools factuels disponibles | ~3000+ |
| `restaurant_assistant` | Profil compile + contexte image/carte, sans cave complete | ~400-1200 |
| `tasting_memory` | Profil compile + tools `query_tastings`/`query_memory` + souvenirs ciblés si utiles | ~700-2000 |

**Note 2026-05-01** : les `user_memory_facts` ne doivent pas redevenir un vrac injecte partout. Ils alimentent surtout le profil compile ; au runtime, Claude peut interroger `query_memory` si une question exige une verification. Les questions exactes sur cave/degustations passent par les tools, pas par le profil ni par un classifier en amont.

### Prompt hint par turnType

| turnType | Hint ajoute au user prompt |
|----------|---------------------------|
| greeting | Instructions d'accueil + exemples + contexte heure/saison |
| prefetch | "Suggestions personnalisees pour ce soir" |
| social_ack (post-task) | "[ACQUITTEMENT — 1 phrase courte, pas de suggestion]" |
| social_ack (idle) | "[CONVERSATION — bref, pas de ui_action]" |
| task_cancel | "[L'utilisateur decline — bref, action_chips]" |
| smalltalk / wine culture | "[QUESTION VIN — connaissances, pas de ui_action]" |
| context_switch (memory) | "[SOUVENIR — utilise les souvenirs fournis]" |
| unknown | "Respond naturally. No ui_action. action_chips for deepening subject, NOT cave reco." |
| task_request / continue | Message brut (pas de hint, le LLM decide) |

## Response Policy : garde-fous post-LLM

`applyResponsePolicy()` intervient **apres** la generation LLM, avant l'envoi au frontend. C'est un filet de securite deterministe :

1. **shouldAllowUiAction = false** --> strip `ui_action` (le Turn Interpreter a decide que ce tour ne devait pas avoir d'action)
2. **Re-reco sur message court** --> si le dernier tour avait `[Vins proposes]` et le message fait < 15 chars, strip `show_recommendations`
3. **Extraction incomplete** --> si `prepare_add_wine` est genere mais sans domaine NI appellation, strip (le LLM est encore en train de collecter)

## Fichiers et roles

### Edge Function (`supabase/functions/celestin/`)

| Fichier | Role |
|---------|------|
| `celestin/index.ts` | Handler HTTP, orchestration, policy, providers LLM, fallback |
| `auth.ts` | Resolution user authentifie via JWT Supabase ; les tools sont desactives si l'utilisateur n'est pas authentifie |
| `tools.ts` | Outils factuels bornes `query_cellar`, `query_tastings`, `query_memory` ; user-scopes, sans SQL libre, limites en volume |
| `turn-interpreter.ts` | Turn Interpreter (routing state-aware, déterministe) |
| `conversation-state.ts` | **NOUVEAU** : types d'etat + transitions (computeNextState) |
| `prompt-builder.ts` | Assemble le system prompt (concatene les 5 modules) |
| `rules.ts` | Routing ui_action : quand recommander, encaver, deguster, converser. 2 exports : `CELESTIN_RULES` (complet) + `CELESTIN_RULES_MEMORY_ONLY` (mode tasting_memory) |
| `persona.ts` | Personnalite : sommelier francais, opinions, ton, interdits |
| `capabilities.ts` | Ce que Celestin sait faire (recommander, encaver, Q&A vin). Inclus **uniquement** pour `cellar_assistant` |
| `response-format.ts` | Format JSON attendu avec exemples (cards, extraction, chips) |
| `wine-codex.ts` | Connaissances vin : accords, temperatures, saisons, styles |

### Frontend (`src/`)

| Fichier | Role |
|---------|------|
| `components/discover/CeSoirModule.tsx` | Orchestrateur UI Celestin + state persistence |
| `hooks/useRecommendations.ts` | Prefetch suggestions au lancement (`__prefetch__`) |
| `lib/recommendationRanking.ts` | Score de pertinence par bouteille (`rankCaveBottles()`) |
| `lib/tastingMemories.ts` | Orchestrateur memoire degustation |
| `lib/tastingMemoryFilters.ts` | Filtres exacts degustation |
| `lib/tastingMemoryRanking.ts` | Ranking local degustation |
| `lib/tastingMemoryFormatting.ts` | Serialisation des souvenirs pour le prompt |
| `lib/tastingTags.ts` | Extraction / persistence des tags de degustation |
| `lib/semanticMemory.ts` | Semantic search via embeddings pgvector + generation fire-and-forget |
| `lib/taste-profile.ts` | Serialisation du profil de gout |
| `lib/questionnaire-profile.ts` | Serialisation du questionnaire FWI |
| `lib/contextHelpers.ts` | Jour, saison, `resolveBottleIds()`, `formatDrunkSummary()` |
| `lib/crossSessionMemory.ts` | Fallback local/debug, hors runtime prompt principal |
| `lib/chatPersistence.ts` | Persistence conversations Supabase + extraction de facts bruts |
| `lib/recommendationStore.ts` | Cache prefetch (module-level) |
| `lib/celestinConversation.ts` | `buildCelestinRequestBody()` — assemble le payload minimal backend-managed par defaut, avec branche legacy isolee pour les flows non migres |
| `lib/celestinChatRequest.ts` | `prepareCelestinRequest()` — orchestre l'appel frontend et ne charge les souvenirs/profil legacy que quand le backend-managed est desactive |
| `lib/userProfiles.ts` | Profil compilé utilisateur + `getCompiledUserProfileCached()` (cache module-level) |
| `lib/enrichWine.ts` | Enrichissement async post-save (fire-and-forget) : arômes, accords, température, pays/région, maturité |

Note de mise a jour sur le frontend :
- `lib/tastingMemories.ts` est devenu un orchestrateur mince
- `buildCelestinRequestBody()` envoie surtout `message`, `history`, `conversationState`, `image` et `contextStrategy: backend_managed`
- la cave pre-rankee, le profil legacy, les souvenirs frontend, les zones et le contexte jour/saison ne partent plus sur le chemin backend-managed

## Providers LLM

| Ordre | Provider | Modele | Particularites |
|-------|----------|--------|----------------|
| 1 | Anthropic | claude-haiku-4-5 | Primaire qualite. Prompt caching sur le system prompt. Tool-use interne sur tours texte authentifies |
| 2 | Google | gemini-2.5-flash | Fallback. responseSchema natif, vision, thinkingBudget 1024 si image / 0 sinon |
| 3 | OpenAI | gpt-4.1-mini | Fallback. Structured outputs (JSON schema strict), vision |

Ordre reel de production aujourd'hui :
- primaire : `Claude Haiku 4.5`
- fallback : `Gemini 2.5 Flash`, puis `GPT-4.1 mini`
- `Mistral` a ete retire du runtime (commit aa2964c, 2026-04-23)

Temperature : 0.5 pour tous les providers.

Chaque provider reconstruit l'historique dans son format natif (messages alternes user/assistant avec images base64).
Claude peut appeler au plus un round d'outils internes :
- `query_cellar` : stock actuel user-scope
- `query_tastings` : degustations passees user-scope
- `query_memory` : faits de memoire conversationnelle user-scope
- `search_cellar_candidates` : candidats de cave pour une recommandation subjective

Ces outils ne sont pas du SQL libre et sont des fonctions serveur bornees. Si l'utilisateur n'est pas authentifie, les outils sont desactives et Claude repond avec le contexte injecte.

Le choix d'usage des sources est explicite dans `SourceMode` :
- `normal` : les tools sont disponibles quand la route/mode les autorise, avec choix modele `auto`.
- `source_required` : le profil/contexte restent injectes, mais Claude doit appeler au moins un outil (`tool_choice:any`) et choisir lequel.
- `forced_tool` : le backend force un outil exact pour les questions factuelles strictes (`query_cellar`, `query_tastings` ou `query_memory`).

`ContextPackage` est le paquet transmis au provider : `ContextPlan` + sources resolues + prompt assemble + history provider. Il ne decide pas quoi charger ; il rend explicite ce qui est envoye a Claude pour le tour courant.

Les fallbacks Gemini/OpenAI n'ont pas les tools internes. Ils peuvent servir de secours conversationnel, mais ne doivent pas devenir la source de verite pour une question exacte. Le debug expose `providerTrace`, les tool calls et les erreurs provider pour detecter ces cas.

## Contrat de reponse

La sortie modele et la reponse HTTP finale sont volontairement separees.

Le modele produit `CelestinProviderResponse` :

```typescript
interface CelestinProviderResponse {
  message: string
  recommendation_selection?: RecommendationSelection[] | null // choix de vins par le LLM
  ui_action?: {
    kind: 'prepare_add_wine' | 'prepare_add_wines' | 'prepare_log_tasting'
    payload: {
      extraction?: WineExtraction
      extractions?: WineExtraction[]
    }
  } | null
  action_chips?: string[] | null
}
```

`show_recommendations` n'est plus une decision libre du provider. Le backend le
construit depuis `recommendation_selection`, apres resolution des bouteilles et
deduplication. Le parser accepte encore `ui_action.show_recommendations` comme
compatibilite legacy, mais ce n'est plus la voie cible.

Les cartes ne reprennent pas le texte conversationnel de Claude. Le texte du
chat reste dans `message`; les cartes sont reconstruites par le backend depuis
les bouteilles resolues (`character`, `food_pairings`, identite, millesime,
couleur). Si Claude a utilise `search_cellar_candidates`, il met uniquement les
`bottle_id` choisis dans `recommendation_selection`.

Pour les recommandations texte, le contexte cave injecte ne contient plus la
shortlist legacy de 40 bouteilles. Le prompt garde le profil, les souvenirs
utiles et un resume/count de cave ; les candidats de cave passent par
`search_cellar_candidates`, puis les `bottle_id` selectionnes sont resolus cote
backend pour construire les cartes.

Dans la voie tools native, un appel a `search_cellar_candidates` rend le chemin
cartes strict : si la reponse finale ne contient pas de `recommendation_selection`
resoluble, le backend ne reconstruit pas de cartes en devinant les bouteilles
depuis le texte. Le texte conversationnel peut rester affiche, mais les cartes
exigent une selection structuree.

Pour contenir les couts de cette voie transitoire, `search_cellar_candidates`
retourne un payload compact (6 candidats par defaut, champs courts,
`why_candidate`) et le follow-up Claude apres tool a un plafond de sortie adapte
au type d outil.

La reponse HTTP finale reste `CelestinResponse` :

```typescript
interface CelestinResponse {
  message: string                    // Toujours present
  recommendation_selection?: RecommendationSelection[] | null // trace du choix modele
  ui_action?: {
    kind: 'show_recommendations'     // Cartes de vin materialisees backend
        | 'prepare_add_wine'         // Encavage single
        | 'prepare_add_wines'        // Encavage batch
        | 'prepare_log_tasting'      // Degustation
    payload: {
      cards?: RecommendationCard[]   // Construites cote backend
      extraction?: WineExtraction    // Pour add_wine / log_tasting
      extractions?: WineExtraction[] // Pour add_wines
    }
  }
  action_chips?: string[]            // 2-3 suggestions de relance
  _nextState?: ConversationState     // Etat dialogue pour le frontend
  _debug?: {                         // Toujours inclus dans la reponse
    turnType: string
    cognitiveMode: string
    provider: string
  }
}
```

**Note :** La réponse HTTP est toujours `200`, même en cas d'erreur (raison : éviter l'échec du CORS preflight sur les 4xx/5xx). En cas d'erreur, seul `{ message }` est renvoyé, sans `ui_action`.

## Memoire : architecture active

```
Couche 1 -- Donnees brutes (Supabase)
  bottles, tasting_tags, zones

Couche 2 -- Profil compile (Supabase)
  user_profiles.compiled_markdown
  Compilation evenementielle : candidate_signals pendant la session,
  check leger fin de session (no_change ou patch), reecriture complete
  periodique (~20 patchs ou ~1/mois)

Couche 3a -- Outils factuels internes Claude (runtime, a la demande)
  Claude decide s'il doit verifier la base.
  Outils disponibles dans celestin/ :
    - query_cellar
    - query_tastings
    - query_memory
  Les outils sont user-scopes, bornes, sans SQL libre, et limites a un round.
  L'ancien classifier LLM reste disponible pour debug/legacy mais n'est plus
  appele par le chemin principal.

Couche 3b -- Souvenirs de degustation (runtime, semantique)
  buildMemoryEvidenceBundle :
    1. filtres exacts si disponibles
    2. ranking local lisible
    3. secours semantique si rien de plausible n'a deja ete trouve

Couche 4 -- Memoire conversationnelle brute (Supabase)
  chat_sessions + chat_messages : persistence complete des conversations
  user_memory_facts : preferences/faits extraits par LLM (extract-chat-insights/)
    sert surtout a la compilation du profil, pas au prompt runtime direct

Couche 5 -- Etat conversationnel (runtime)
  State Machine (persistedConversationState, module-level)
  Historique enrichi (cards + actions resumees dans les turns)
  Nettoyage images : seules les 2 dernieres photos user sont conservees
```

Les couches 3a et 3b sont complementaires : le SQL factuel garantit la non-hallucination sur les questions "Ctrl+F enrichi" (combien, quels, ai-je bu, mes meilleurs, en mars, a Rome), les souvenirs de degustation apportent la couleur et les verbatims pour les questions de synthese et de subjectivite.

- `src/lib/tastingMemories.ts`
- `src/lib/tastingMemoryFilters.ts`
- `src/lib/tastingMemoryRanking.ts`

Role :
- distinguer les questions memoire `exact` et `synthese`
- construire un `Evidence Bundle` borne avant l'appel au LLM
- appliquer d'abord des filtres exacts et un ranking local
- n'utiliser le semantique qu'en secours

Ce qui change :
- `Ai-je deja bu des Brunello ?` --> filtre exact sur les bouteilles degustees
- `Qu'est-ce que j'ai pense des Brunello ?` --> sous-ensemble exact puis synthese
- `D'autres vins italiens ?` --> elargissement controle au lieu de rester colle au dernier vin cite
- les facts conversationnels ne sont plus persistes si leur `source_quote` n'est pas retrouvable dans un vrai message utilisateur

## Persistance

| Mecanisme | Scope | Duree | Usage |
|-----------|-------|-------|-------|
| `persistedMessages` (module-level) | Navigation entre onglets | Session app | Chat survit au changement d'onglet |
| `persistedConversationState` (module-level) | Navigation entre onglets | Session app | Etat dialogue survit au changement d'onglet |
| `chat_sessions` + `chat_messages` (Supabase) | Multi-device | Indefini | Conversations completes |
| `user_memory_facts` (Supabase) | Multi-device | Indefini (sauf temporaires) | Preferences et faits extraits |
| `localStorage` (cross-session) | Entre sessions | 7 jours (TTL) | Fallback offline |
| Prefetch cache (module-level) | Session app | Jusqu'au reload | Recommandations initiales |
