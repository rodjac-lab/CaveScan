# Recommendation Modes & Scoring

Version: v2
Status: Working spec (aligned with current implementation as of 2026-03-01)

## 1. Goal

Define how the recommendation engine decides what to suggest in each mode:

- `generic`: no explicit food/style constraint
- `food`: user provides dish/ingredient context
- `wine`: user provides wine style intent
- `surprise`: controlled exploration from cellar

This document is the reference for:

- overall pipeline architecture
- scoring logic (deterministic ranking)
- tasting memory selection
- hard guardrails (must-not-violate rules)
- LLM enrichment scope
- caching & prefetch strategy

## 2. Architecture

### 2.1 Pipeline overview

```
[User opens Cheers / changes mode/query]
        │
        ▼
┌──────────────────────┐
│ 1. Local Ranking     │  recommendationRanking.ts
│    rankCaveBottles()  │  Deterministic scoring of in-stock bottles
└──────────┬───────────┘
           │ top 24 candidates
           ▼
┌──────────────────────┐
│ 2. Memory Selection  │  tastingMemories.ts
│    selectRelevant     │  Score drunk bottles by tags, sentiment,
│    Memories()         │  rating, recency, query match
└──────────┬───────────┘
           │ top 5 memories
           ▼
┌──────────────────────┐
│ 3. LLM Enrichment   │  Edge function: recommend-wine
│    Gemini Flash      │  Receives: candidates + memories + profile
│    (Haiku fallback)  │  Returns: 3-5 cards with pitchs, badges
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 4. Cache & Display   │  recommendationStore.ts
│    10min memory cache │  useRecommendations hook
└──────────────────────┘
```

### 2.2 Relevant source files

| File | Role |
|---|---|
| `src/lib/recommendationRanking.ts` | Local deterministic scoring + local card builder |
| `src/lib/tastingMemories.ts` | Memory selection & serialization for prompt |
| `src/hooks/useRecommendations.ts` | React hook, prefetch, API orchestration |
| `src/lib/recommendationStore.ts` | In-memory cache (10min TTL per queryKey) |
| `supabase/functions/recommend-wine/index.ts` | LLM edge function (Gemini primary, Haiku fallback) |
| `supabase/functions/recommend-wine/wine-codex.ts` | Opinionated wine knowledge base (system prompt) |
| `supabase/functions/extract-tasting-tags/index.ts` | Tag extraction from tasting notes |
| `src/components/CeSoirModule.tsx` | UI component |

## 3. Modes

### 3.1 Generic mode

Use when user did not provide explicit food or style query.

Intent:

- propose a smart evening selection from real cellar
- balance pleasure, relevance, and variety

Primary decision factors:

1. Temporal context (season, weekday vs weekend)
2. User taste profile (top appellations/domaines, preferred colors, ratings/rebuy)
3. Recency/rotation (avoid recently drunk similar bottles)
4. Cellar state (availability, maturity window)
5. Value signal (QPR bias, avoid always suggesting top expensive picks)
6. Tasting memories (cite past experiences when relevant)

### 3.2 Food mode

Use when user provides dish/ingredient constraints (e.g. "pâtes carbonara").

Intent:

- maximize food pairing quality first
- cite relevant tasting memories when user has tasted wines with similar dishes

Primary decision factors:

1. Pairing compatibility (hard priority)
2. Memory match: `tags.plats` matched against query (+4 per match)
3. User profile affinity
4. Recency avoidance
5. Cellar availability

Hard examples:

- fish/seafood + tannic red: strongly penalized
- red meat + structured red: promoted

### 3.3 Wine mode

Use when user asks for a style/type (e.g. Champagne, light red, fresh white).

Intent:

- satisfy style preference first
- leverage tasting memories with matching descriptors

Primary decision factors:

1. Style/color match
2. Memory match: `tags.descripteurs` matched against query (+4 per match)
3. Profile affinity
4. Recency/rotation
5. Cellar availability/value

### 3.4 Surprise mode

Use when user explicitly asks for discovery.

Intent:

- suggest forgotten or atypical cellar options with controlled risk

Primary decision factors:

1. Under-explored cellar segments
2. Distinctiveness vs recent history
3. Sufficient fit to profile (avoid random noise)

UI status: not exposed yet in current UI.

## 4. Scoring Model

### 4.1 Local ranking (`rankCaveBottles`)

Total score is weighted sum:

`score = context + profile + query_match + recency + value + maturity + exploration`

Suggested starting weights by mode:

| Factor | generic | food | wine | surprise |
|---|---|---|---|---|
| context | 0.25 | - | - | 0.05 |
| profile | 0.25 | 0.20 | 0.25 | 0.20 |
| query_match | - | 0.45 | 0.40 | - |
| recency | 0.20 | 0.20 | 0.20 | 0.20 |
| value | 0.15 | 0.10 | 0.10 | 0.10 |
| maturity | 0.10 | 0.05 | 0.05 | 0.10 |
| exploration | 0.05 | - | - | 0.35 |

Notes:

- weights are normalized targets; internal implementation uses arbitrary raw points
- tune with real telemetry, not intuition only

### 4.2 Tasting memory scoring (`selectRelevantMemories`)

Selects the most relevant past tasting experiences to inject into the LLM prompt.

Input: all drunk bottles with a tasting note.

Scoring per bottle:

| Factor | Points | Notes |
|---|---|---|
| **Query → tags.plats** (food mode) | +4 per match | Normalized, diacritics-insensitive |
| **Query → tags.descripteurs** (wine mode) | +4 per match | |
| **Query → tags.keywords** | +2 per match | All modes |
| **Query → tags (generic)** | +3 per match (plats & descripteurs) | |
| **Fallback: query → raw tasting_note** | +2 per word match | When no tags or no tag matches |
| **Sentiment: excellent** | +3 | |
| **Sentiment: bon** | +1 | |
| **Rating >= 4** | +1.5 | |
| **Rating == 5** | +1.0 bonus | Stacks with >= 4 |
| **Recency < 30 days** | +1.5 | |
| **Recency < 90 days** | +0.8 | |
| **Recency < 180 days** | +0.3 | |

Output: top 5 memories sorted by score (only those with score > 0).

### 4.3 Tasting tags schema (`TastingTags`)

Extracted automatically from tasting notes via the `extract-tasting-tags` edge function (Gemini Flash primary, Haiku fallback). Fire-and-forget after each note save.

```json
{
  "plats": ["spaghetti", "carbonara"],
  "descripteurs": ["fruité", "crémeux", "vineux"],
  "occasion": "anniversaire d'Aurelien",
  "sentiment": "excellent",
  "keywords": ["accord parfait", "texture", "ça valait le coup d'attendre"]
}
```

- `plats`: dishes, ingredients, cuisine types mentioned
- `descripteurs`: wine adjectives and descriptions
- `occasion`: context if mentioned (restaurant, event, etc.), null otherwise
- `sentiment`: overall feeling — `excellent` | `bon` | `moyen` | `decevant` | null
- `keywords`: key expressions summarizing the experience

Stored in `bottles.tasting_tags` (JSONB column).

## 5. Hard Rules / Guardrails

These rules override score when violated:

1. **Pairing red flags** (food mode)
   - no clearly incompatible pairing (e.g., powerful tannic red with seafood)
   - enforced both in local ranking and in LLM system prompt (Wine Codex)

2. **Stock integrity**
   - suggest only `in_stock` cellar bottles for "De ta cave" cards
   - LLM cannot invent bottles outside the provided shortlist

3. **Recency throttle**
   - do not re-suggest same bottle from immediate recent history unless explicitly requested

4. **Output integrity**
   - keep card payload valid and bounded (3-5 cards max, supported badge/color values)
   - badges: "De ta cave", "Découverte", "Accord parfait", "Audacieux"
   - colors: "rouge", "blanc", "rose", "bulles"

## 6. LLM Role (strict scope)

### LLM should:

- enrich shortlisted candidates with narrative pitch (1-2 phrases, like a mini Netflix review)
- adjust ordering slightly (within candidate set)
- assign badge tone/personality
- cite relevant tasting memories naturally in pitchs (1-2 max)
  - e.g. "Tu avais adoré ce Chianti sur des spaghetti à Rome — ce Sangiovese va dans la même veine"
- use the Wine Codex for domain knowledge and pairing rules

### LLM should not:

- ignore hard pairing guardrails
- hallucinate unavailable cellar bottles as "De ta cave"
- replace deterministic candidate selection logic
- force memories when none are relevant
- be condescending — the sommelier is passionate and opinionated but never generic

### LLM personality

- Tutoie l'utilisateur
- Passionate, sometimes enthusiastic, never condescending
- Strong opinions backed by reasoning
- Cultural references (cinema, music, seasons) to make pitchs vivid

## 7. Caching & Prefetch Strategy

### 7.1 Cache (`recommendationStore.ts`)

- In-memory cache with 10-minute TTL per `queryKey`
- `queryKey` = `${mode}:${query}`
- Cache hit → display immediately, no API call

### 7.2 Prefetch (`prefetchDefaultRecommendations`)

- Called once at app startup (AppLayout mount), fire-and-forget
- Fetches `generic` mode recommendations and caches them
- Guard `prefetchStarted` prevents duplicates
- On failure: resets flag, hook will retry on page visit

### 7.3 Hook behavior (`useRecommendations`)

| Trigger | Cache hit | Cache miss |
|---|---|---|
| **Initial mount** | Show cached cards | Show local cards, NO API call |
| **User action** (chip, query, mode) | Show cached cards | Show local cards + API call in background |

- Local cards = `buildLocalRecommendationCards()` from ranked in-stock bottles
- Fallback to static `FALLBACK_CARDS` if no cave bottles at all
- `requestIdRef` prevents stale responses from overwriting newer ones

## 8. Data Flow: Tasting Note → Sommelier Memory

```
User saves tasting note
        │
        ▼
TastingSection.handleSaveTastingNote()
        │
        ├── 1. Save to DB (tasting_note, rating, rebuy, qpr)
        ├── 2. triggerProfileRecompute()
        └── 3. extractAndSaveTags(bottle)     ← fire-and-forget
                    │
                    ▼
            Edge function: extract-tasting-tags
            (Gemini Flash → Haiku fallback)
                    │
                    ▼
            Save tasting_tags JSONB to bottles table
                    │
                    ▼
            [Next recommendation request]
                    │
                    ▼
            selectRelevantMemories() picks top memories
                    │
                    ▼
            serializeMemoriesForPrompt() → compact text
                    │
                    ▼
            Injected into recommend-wine prompt
                    │
                    ▼
            Sommelier cites the memory in its pitch
```

## 9. Providers & Costs

| Function | Primary | Fallback | Approx tokens |
|---|---|---|---|
| `recommend-wine` | Gemini 2.0 Flash | Claude Haiku 4.5 | ~1300 in / ~500 out |
| `extract-tasting-tags` | Gemini 2.0 Flash | Claude Haiku 4.5 | ~150 in / ~50 out |
| `extract-wine` (OCR) | Gemini 2.0 Flash | Claude Haiku 4.5 | ~500 in / ~200 out |

All edge functions use 15s timeout and `--no-verify-jwt` deployment.

## 10. Telemetry & Evaluation

Track per mode:

1. `time_to_first_card`
2. `time_to_enriched_card`
3. `refinement_click_rate`
4. `open_bottle_rate`
5. `repeat_recommendation_rate` (short horizon)
6. `fallback_rate` (LLM/provider failure path)

Offline checks:

- replay scenarios by mode (golden set)
- verify guardrail compliance
- compare deterministic top-N vs final displayed cards

## 11. Decision Log

### 2026-03-01: Tasting Memory Tags

- **Change**: Added tasting memory extraction and injection into sommelier prompt
- **Affected modes**: all (generic, food, wine, surprise)
- **Expected UX impact**: Sommelier cites past tasting experiences, creating a feedback loop that motivates users to write more notes
- **Metrics to watch**: tasting_saved event rate, memory citation frequency
- **Rollback**: Remove `memories` from callRecommendApi body; sommelier works without memories

### 2026-02-28: Prefetch & Local Cards

- **Change**: No API call on hook mount; prefetch at app startup; local cards as instant fallback
- **Affected modes**: all
- **Expected UX impact**: Instant display on Cheers page, no loading spinner
- **Rollback**: Re-enable API call on mount in useRecommendations

## 12. Next Steps

1. Improve local card `reason` text using scoring criteria (currently generic).
2. Create a small golden test dataset for ranking regressions.
3. Add minimal scoring trace logs (mode + top factors) in dev builds.
4. Consider exposing `surprise` mode in UI.
5. Optional: backfill script to re-extract tags when prompt improves.
