# Architecture Celestin

Celestin est le sommelier IA de l'app. Ce document decrit comment un message utilisateur est traite, du tap sur "Envoyer" jusqu'a la reponse affichee.

## Flux complet

```
╔══════════════════════════════════════════════════════════════════╗
║                      FRONTEND (React)                           ║
║                 CeSoirModule.tsx + libraries                    ║
╚══════════════════════════════════════════════════════════════════╝

  User tape un message (+ photo optionnelle)
       │
       ▼
  buildRequestBody()
       │
       ├─ rankCaveBottles()              → cave triée par pertinence
       ├─ serializeProfileForPrompt()    → profil de goût texte
       ├─ serializeQuestionnaireForPrompt() → FWI + préfs sensorielles
       ├─ selectRelevantMemories()       → souvenirs de dégustation
       ├─ serializePreviousSessionsForPrompt() → sessions précédentes
       ├─ getDayOfWeek(), getSeason()    → contexte temporel
       └─ zones, recentDrunk            → métadonnées
       │
       ▼
  RequestBody = {
    message, history[], cave[], profile, questionnaireProfile,
    memories, previousSession, context, zones, image?
  }
       │
       ▼  HTTP POST → supabase.functions.invoke('celestin')

╔══════════════════════════════════════════════════════════════════╗
║              EDGE FUNCTION  celestin/index.ts                   ║
╚══════════════════════════════════════════════════════════════════╝
       │
       ▼
  ┌─────────────────────────────────────┐
  │  classifyIntent(message, hasImage)  │  ◄── CODE, pas de LLM
  │                                     │
  │  greeting       → "__greeting__"    │
  │  prefetch       → "__prefetch__"    │
  │  conversation   → merci, questions, │
  │                   messages courts    │
  │  recommendation → "en blanc",       │
  │                   "que boire", etc.  │
  │  unknown        → le LLM décide    │
  └────────────┬────────────────────────┘
               │
       ┌───────┴───────┐
       ▼               ▼
  buildSystemPrompt()  buildUserPrompt(body)
       │                    │
       │               Si conversation:
       │               "[CONVERSATION — PAS de ui_action.
       │                Reponds BRIEVEMENT.]"
       │               + message brut
       │
       │               Si recommendation/unknown:
       │               message brut + image hint
       │               + contexte jour/saison
       │
       ▼
  ┌──────────────────────────────────────────────┐
  │           SYSTEM PROMPT (assemblé)           │
  │                                              │
  │  1. WINE_CODEX        (wine-codex.ts)        │
  │     → accords, températures, saisons         │
  │                                              │
  │  2. CELESTIN_PERSONA  (persona.ts)           │
  │     → sommelier français, opinions, ton      │
  │     → interdits: "Ah", "Oh", questions rhét. │
  │                                              │
  │  3. CELESTIN_CAPABILITIES (capabilities.ts)  │
  │     → recommander, encaver, déguster, Q&A    │
  │                                              │
  │  4. CELESTIN_RULES    (rules.ts)             │
  │     → routing: quand show_recommendations    │
  │       vs prepare_add_wine vs conversation    │
  │     → règles cave: jamais changer couleur    │
  │     → règles photo: carte resto ≠ cave       │
  │                                              │
  │  5. CELESTIN_RESPONSE_FORMAT                 │
  │     (response-format.ts)                     │
  │     → JSON: message + ui_action? + chips?    │
  │                                              │
  │  --- CONTEXTE UTILISATEUR ---                │
  │  (buildContextBlock)                         │
  │     → profil de goût                         │
  │     → questionnaire FWI                      │
  │     → souvenirs de dégustation               │
  │     → sessions précédentes                   │
  │     → zones de stockage                      │
  │     → cave complète (N bouteilles triées)    │
  └──────────────────┬───────────────────────────┘
                     │
                     ▼
  ┌──────────────────────────────────────────────┐
  │       celestinWithFallback()                 │
  │                                              │
  │  Provider 1: GPT-4.1 mini  (OpenAI)         │
  │       │  structured outputs + vision         │
  │       ▼ fail?                                │
  │  Provider 2: Claude Haiku 4.5 (Anthropic)   │
  │       │  meilleur suivi d'instructions       │
  │       ▼ fail?                                │
  │  Provider 3: Gemini 2.5 Flash (Google)       │
  │       │  responseSchema + vision             │
  │       ▼ fail?                                │
  │  Mistral Small (dernier recours, no vision)  │
  │                                              │
  │  Chaque provider :                           │
  │  1. Envoie system prompt                     │
  │  2. Reconstruit history[] en messages natifs │
  │     (avec images base64 si vision)           │
  │  3. Ajoute userPrompt comme dernier message  │
  │  4. Parse JSON → parseAndValidate()          │
  └──────────────────┬───────────────────────────┘
                     │
                     ▼
  CelestinResponse = {
    message: "Bonne idée le Morgon !",
    ui_action?: {
      kind: "show_recommendations",
      payload: { cards: [...] }
    },
    action_chips?: ["Et en blanc ?", "Autre plat"]
  }
       │
       ▼  HTTP 200 + JSON

╔══════════════════════════════════════════════════════════════════╗
║              RESPONSE ROUTING (CeSoirModule)                    ║
╚══════════════════════════════════════════════════════════════════╝
       │
       ├─ show_recommendations
       │   → resolveBottleIds(cards, cave)
       │   → affiche cartes de vin + action_chips
       │
       ├─ prepare_add_wine
       │   → navigate('/addBottle', { prefillExtraction })
       │
       ├─ prepare_add_wines
       │   → navigate('/addBottle', { prefillBatchExtractions })
       │
       ├─ prepare_log_tasting
       │   → navigate('/tastingForm', { prefillExtraction })
       │
       └─ (pas de ui_action)
           → affiche message texte + action_chips

  persistedMessages[] ← sauvegardé (module-level + localStorage)
```

## Fichiers et rôles

### Edge Function (`supabase/functions/celestin/`)

| Fichier | Rôle |
|---------|------|
| `index.ts` | Handler HTTP + classifieur d'intent + providers LLM + fallback |
| `prompt-builder.ts` | Assemble le system prompt (concatène les 5 modules) |
| `rules.ts` | Routing ui_action : quand recommander, encaver, déguster, converser |
| `persona.ts` | Personnalité : sommelier français, opinions, ton, interdits |
| `capabilities.ts` | Ce que Celestin sait faire (recommander, encaver, Q&A vin) |
| `response-format.ts` | Format JSON attendu avec exemples (cards, extraction, chips) |
| `wine-codex.ts` | Connaissances vin : accords, températures, saisons, styles |

### Frontend (`src/`)

| Fichier | Rôle |
|---------|------|
| `components/discover/CeSoirModule.tsx` | Chat UI + `buildRequestBody()` + `callCelestin()` |
| `hooks/useRecommendations.ts` | Prefetch suggestions au lancement (`__prefetch__`) |
| `lib/recommendationRanking.ts` | Score de pertinence par bouteille (`rankCaveBottles()`) |
| `lib/tastingMemories.ts` | Sélection et sérialisation des souvenirs de dégustation |
| `lib/taste-profile.ts` | Sérialisation du profil de goût |
| `lib/questionnaire-profile.ts` | Sérialisation du questionnaire FWI |
| `lib/contextHelpers.ts` | Jour, saison, `resolveBottleIds()`, `formatDrunkSummary()` |
| `lib/crossSessionMemory.ts` | Persistance sessions (localStorage, rotation, TTL 7j) |
| `lib/recommendationStore.ts` | Cache prefetch (module-level) |

## Classifieur d'intent (code-side)

Avant d'appeler le LLM, `classifyIntent()` dans `index.ts` analyse le message avec des regex :

| Intent | Déclencheurs | Effet sur le prompt |
|--------|-------------|---------------------|
| `greeting` | `__greeting__` | Prompt spécial accueil, pas de ui_action |
| `prefetch` | `__prefetch__` | Suggestions sans contrainte de plat |
| `conversation` | "merci", "super", questions générales, messages < 20 chars | Injecte `[CONVERSATION — PAS de ui_action]` |
| `recommendation` | "que boire", "en blanc", "pour accompagner", etc. | Message brut, le LLM génère des cartes |
| `unknown` | Tout le reste, images | Le LLM décide librement |

L'intent est loggé pour debug : `[celestin] message="..." intent=conversation`.

## Providers LLM

| Ordre | Provider | Modèle | Particularités |
|-------|----------|--------|----------------|
| 1 | OpenAI | gpt-4.1-mini | Structured outputs (JSON schema strict), vision |
| 2 | Anthropic | claude-haiku-4-5 | Meilleur suivi d'instructions, vision |
| 3 | Google | gemini-2.5-flash | responseSchema natif, vision, thinking budget |
| 4 | Mistral | mistral-small | Pas de vision, dernier recours |

Chaque provider reconstruit l'historique dans son format natif (messages alternés user/assistant avec images base64).

## Structure du system prompt

```
WINE_CODEX                        Connaissances vin (accords, T°, saisons)
CELESTIN_PERSONA                  Personnalité et ton
CELESTIN_CAPABILITIES             Ce qu'il sait faire
CELESTIN_RULES                    Routing + contraintes cave + photo
CELESTIN_RESPONSE_FORMAT          JSON attendu + exemples
--- CONTEXTE UTILISATEUR ---      (ajouté par buildContextBlock)
  Profil de goût                  Préférences dérivées de l'historique
  Questionnaire FWI               Score Wine Interest + préfs sensorielles
  Souvenirs de dégustation        Notes de dégustation passées
  Sessions précédentes            Résumé des conversations récentes
  Zones de stockage               Noms des zones disponibles
  Cave complète (N btl)           Triée par local_score
```

## Structure du user prompt

| Intent | Contenu du user prompt |
|--------|------------------------|
| conversation | `[CONVERSATION — PAS de ui_action...]` + message brut |
| recommendation | message brut + contexte jour/saison |
| greeting | instructions d'accueil + exemples + contexte heure/saison |
| prefetch | "suggestions personnalisées pour ce soir" |
| unknown | message brut + hint image + contexte jour/saison |

## Types de réponse

```typescript
interface CelestinResponse {
  message: string                    // Toujours présent
  ui_action?: {
    kind: 'show_recommendations'     // Cartes de vin
        | 'prepare_add_wine'         // Encavage single
        | 'prepare_add_wines'        // Encavage batch
        | 'prepare_log_tasting'      // Dégustation
    payload: {
      cards?: RecommendationCard[]   // Pour show_recommendations
      extraction?: WineExtraction    // Pour add_wine / log_tasting
      extractions?: WineExtraction[] // Pour add_wines
    }
  }
  action_chips?: string[]            // 2-3 suggestions de relance
}
```

## Mémoire : 4 couches

```
Couche 1 — Faits (Supabase)
  bottles, tasting_tags, zones

Couche 2 — Profil inféré (Supabase)
  computeTasteProfile → appellations/domaines préférés, couleurs, prix, QPR

Couche 3 — Souvenirs (Supabase + runtime)
  selectRelevantMemories → tasting notes + tags pertinents

Couche 4 — État conversationnel
  Cross-session (localStorage, TTL 7j)
  Persistance intra-session (module-level variable)
  Historique enrichi (cards + actions résumées dans les turns)
```

## Persistance

| Mécanisme | Scope | Durée | Usage |
|-----------|-------|-------|-------|
| `persistedMessages` (module-level) | Navigation entre onglets | Session app | Chat survit au changement d'onglet |
| `localStorage` (cross-session) | Entre sessions | 7 jours (TTL) | Résumé des conversations précédentes |
| Prefetch cache (module-level) | Session app | Jusqu'au reload | Recommandations initiales |
