# Architecture Celestin

Celestin est le sommelier IA de l'app. Ce document decrit comment un message utilisateur est traite, du tap sur "Envoyer" jusqu'a la reponse affichee.

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
|                 CeSoirModule.tsx + libraries                    |
+================================================================+

  User tape un message (+ photo optionnelle)
       |
       v
  buildRequestBody()
       |
       +-- rankCaveBottles()              --> cave triee par pertinence
       +-- serializeProfileForPrompt()    --> profil de gout texte
       +-- serializeQuestionnaireForPrompt() --> FWI + prefs sensorielles
       +-- buildMemoryEvidenceBundle()    --> preuves memoire exact / synthese / semantique
       +-- memoryFactsRaw                 --> facts conversationnels structures
       +-- previousSessionSummaries       --> resumes de sessions structures
       +-- retrievedConversation?         --> ancienne conversation si reference explicite
       +-- getDayOfWeek(), getSeason()    --> contexte temporel
       +-- zones, recentDrunk             --> metadonnees
       +-- persistedConversationState     --> etat dialogue courant
       |
       v
  RequestBody = {
    message, history[], cave[], profile, questionnaireProfile,
    memories, previousSession, context, zones, image?,
    conversationState?,
    memoryEvidenceMode?, memoryFactsRaw?, previousSessionSummaries?,
    retrievedConversation?   <-- memoire moderne envoyee en structure
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
  |   User Model Resolver (shared code)          |
  |                                              |
  |  Inputs :                                    |
  |   memoryFactsRaw + previousSessionSummaries  |
  |   + turnType + cognitiveMode + message       |
  |                                              |
  |  Output :                                    |
  |   resolvedUserModel                          |
  |   (portrait utilisateur actuel)              |
  +--------------------+-------------------------+
                       |
                       v
  +----------------------------------------------+
  |       celestinWithFallback()                 |
  |                                              |
  |  Provider 1: Gemini 2.5 Flash (Google)      |
  |       | fail?                                |
  |  Provider 2: GPT-4.1 mini (OpenAI)          |
  |                                              |
  |  Claude et Mistral restent disponibles       |
  |  uniquement via forcedProvider (eval/debug)  |
  |                                              |
  |  Chaque provider :                           |
  |  1. Envoie system prompt + contexte          |
  |  2. Reconstruit history[] en format natif    |
  |  3. Ajoute userPrompt comme dernier message  |
  |  4. Parse JSON --> parseAndValidate()        |
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
    ui_action?: { kind, payload },
    action_chips?: ["Et en blanc ?", "Autre plat"],
    _nextState: { phase, taskType, ... }  <-- pour le frontend
  }
       |
       v  HTTP 200 + JSON

+================================================================+
|         RESPONSE ROUTING (CeSoirModule.tsx)                     |
+================================================================+
       |
       +-- _nextState
       |   --> persistedConversationState = _nextState
       |
       +-- show_recommendations
       |   --> resolveBottleIds(cards, cave)
       |   --> affiche cartes de vin + action_chips
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
- l'ordre reel est : `Turn Interpreter` -> `User Model Resolver` -> `buildContextBlock()` / `buildUserPrompt()` -> appel LLM
- le grand schema ci-dessus simplifie un peu la mise en page, mais le resolver agit bien avant la construction finale du contexte prompt

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
| `greeting` / `social` | Memory facts + profil + cave count | ~250 |
| `wine_conversation` | Memory facts + profil + questionnaire + souvenirs de degustation | ~500 |
| `cellar_assistant` | Memory facts + TOUT : cave complete + profil + souvenirs + sessions + zones + questionnaire | ~3000+ |
| `restaurant_assistant` | Memory facts + profil + questionnaire (image dans le message) | ~400 |
| `tasting_memory` | Memory facts + profil + souvenirs + sessions + cave count | ~700 |

**Note V2.5** : Memory facts (preferences extraites des conversations) sont injectes dans TOUS les modes. Souvenirs de degustation (verbatim, tags) disponibles en `wine_conversation`, `tasting_memory` et `cellar_assistant`.

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
| `index.ts` | Handler HTTP, orchestration, policy, providers LLM, fallback |
| `turn-interpreter.ts` | **NOUVEAU** : Turn Interpreter (remplace classifyIntent) — routing state-aware |
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
| `components/discover/CeSoirModule.tsx` | Chat UI + `buildRequestBody()` + `callCelestin()` + state persistence |
| `hooks/useRecommendations.ts` | Prefetch suggestions au lancement (`__prefetch__`) |
| `lib/recommendationRanking.ts` | Score de pertinence par bouteille (`rankCaveBottles()`) |
| `lib/tastingMemories.ts` | Retrieval Planner + Evidence Bundle + selection exacte / synthese / semantique |
| `lib/semanticMemory.ts` | Semantic search via embeddings pgvector + generation fire-and-forget |
| `lib/taste-profile.ts` | Serialisation du profil de gout |
| `lib/questionnaire-profile.ts` | Serialisation du questionnaire FWI |
| `lib/contextHelpers.ts` | Jour, saison, `resolveBottleIds()`, `formatDrunkSummary()` |
| `lib/crossSessionMemory.ts` | Persistance sessions (localStorage fallback + Supabase primary) |
| `lib/chatPersistence.ts` | **V2.5** : persistence conversations Supabase, extraction insights, retrieval semantique |
| `lib/memoryFactsSerializer.ts` | **V2.5** : serialisation des memory facts pour injection prompt |
| `lib/recommendationStore.ts` | Cache prefetch (module-level) |
| `lib/celestinConversation.ts` | `buildCelestinRequestBody()` — assemble le payload (cave rankée, profil, mémoires, questionnaire, état, memoryFacts, retrievedConversation) |
| `lib/enrichWine.ts` | Enrichissement async post-save (fire-and-forget) : arômes, accords, température, pays/région, maturité |

Note de mise a jour sur le frontend :
- `lib/tastingMemories.ts` porte maintenant le Retrieval Planner et construit un `Evidence Bundle`
- `buildCelestinRequestBody()` envoie aussi `memoryEvidenceMode`, `memoryFactsRaw`, `previousSessionSummaries` et `retrievedConversation`

## Providers LLM

| Ordre | Provider | Modele | Particularites |
|-------|----------|--------|----------------|
| 1 | OpenAI | gpt-4.1-mini | Structured outputs (JSON schema strict), vision |
| 2 | Anthropic | claude-haiku-4-5 | Meilleur suivi d'instructions, vision |
| 3 | Google | gemini-2.5-flash | responseSchema natif, vision, thinkingBudget 1024 si image / 0 sinon |
| 4 | Mistral | mistral-small-latest | Uniquement via forcedProvider (mode eval), pas dans la chaîne de prod |

Ordre reel de production aujourd'hui :
- primaire : `Gemini 2.5 Flash`
- fallback : `GPT-4.1 mini`
- `Claude` et `Mistral` restent disponibles via `forcedProvider` en eval/debug

Temperature : 0.5 pour tous les providers.

Chaque provider reconstruit l'historique dans son format natif (messages alternes user/assistant avec images base64).

## Types de reponse

```typescript
interface CelestinResponse {
  message: string                    // Toujours present
  ui_action?: {
    kind: 'show_recommendations'     // Cartes de vin
        | 'prepare_add_wine'         // Encavage single
        | 'prepare_add_wines'        // Encavage batch
        | 'prepare_log_tasting'      // Degustation
    payload: {
      cards?: RecommendationCard[]   // Pour show_recommendations
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

## Memoire : 5 couches

```
Couche 1 -- Faits vin (Supabase)
  bottles, tasting_tags, zones

Couche 2 -- Profil infere (Supabase)
  computeTasteProfile --> appellations/domaines preferes, couleurs, prix, QPR

Couche 3 -- Souvenirs de degustation (Supabase + runtime + retrieval hybride)
  buildMemoryEvidenceBundle :
    1. classifie la question en exact / synthese / semantique
    2. exact : filtres sur bouteilles `drunk` (pays, region, appellation, domaine, cuvee)
    3. synthese : sous-ensemble exact si possible, puis synthese LLM
    4. semantique : embeddings pgvector + fallback keyword matching
  Embedding genere fire-and-forget a chaque sauvegarde de note de degustation
  Colonne embedding vector(1536) sur bottles, RPC search_memories (score hybride)

Couche 4 -- Memoire conversationnelle (Supabase, V2.5)
  chat_sessions + chat_messages : persistence complete des conversations
  user_memory_facts : preferences/faits extraits par LLM (extract-chat-insights/)
    Categories : preference, aversion, context, life_event, wine_knowledge, social, cellar_intent
    Supersedure : quand une preference evolue, l'ancienne est marquee superseded_by
    Temporalite : is_temporary + expires_at pour les contextes ephemeres
    Garde-fou : un fait durable sans `source_quote` utilisateur credible n'est pas persiste
  summary_embedding : embedding du summary de session pour retrieval semantique
  Injection : `memoryFactsRaw` + `previousSessionSummaries` alimentent le User Model Resolver
  Fallback : `memoryFacts` texte reste disponible si le portrait resolu est absent
  Retrieval : regex frontend detecte references au passe -> semantic search -> messages complets

Couche 5 -- Etat conversationnel (runtime)
  State Machine (persistedConversationState, module-level)
  Historique enrichi (cards + actions resumees dans les turns)
  Nettoyage images : seules les 2 dernieres photos user sont conservees
```

## Update 29 mars 2026 - User Model Resolver

Nouvelle couche partagee :

- `shared/celestin/user-model-resolver.ts`

Role :
- prendre `memoryFactsRaw` + `previousSessionSummaries`
- produire un `portrait utilisateur actuel`
- adapter ce portrait au `cognitiveMode`
- faire primer les evolutions recentes et contextes temporaires sur les signaux plus anciens

Ce qui change :
- le frontend envoie des facts structures et des summaries structures
- l'edge function Celestin construit un portrait resolu juste apres le Turn Interpreter
- ce portrait devient la couche memoire prioritaire du prompt (`memoryFacts` texte n'est plus qu'un fallback)
- les facts sauvegardes sont dedoublonnes et peuvent superseder les anciens
- la memoire active est rechargee pendant la session apres extraction

Doc de reference :
- `docs/celestin-user-model-resolver.md`

## Update 30 mars 2026 - Retrieval Planner et grounding

Nouvelles briques :

- `src/lib/tastingMemories.ts`
- `docs/celestin-retrieval-planner.md`

Role :
- distinguer les questions memoire `exact`, `synthese` et `semantique`
- construire un `Evidence Bundle` borne avant l'appel au LLM
- eviter qu'une question d'inventaire soit traitee comme un simple souvenir probable

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
