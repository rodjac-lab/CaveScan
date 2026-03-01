# Recommendation Modes & Scoring

Version: v1  
Status: Working spec (aligned with current implementation + target evolution)

## 1. Goal

Define how the recommendation engine decides what to suggest in each mode:

- `generic`: no explicit food/style constraint
- `food`: user provides dish/ingredient context
- `wine`: user provides wine style intent
- `surprise`: controlled exploration from cellar

This document is the reference for:

- scoring logic (deterministic ranking)
- hard guardrails (must-not-violate rules)
- LLM enrichment scope
- future tuning and analytics

## 2. Current Architecture (as of now)

Pipeline:

1. Local deterministic ranking selects candidates from in-stock bottles.
2. LLM receives shortlisted bottles and writes final cards (pitch, badge, ordering polish).
3. UI shows fast-first recommendations and refreshes with enriched output.

Relevant code:

- `src/lib/recommendationRanking.ts`
- `src/hooks/useRecommendations.ts`
- `supabase/functions/recommend-wine/index.ts`

## 3. Modes

### 3.1 Generic mode

Use when user did not provide explicit food or style query.

Intent:

- propose a smart evening selection from real cellar
- balance pleasure, relevance, and variety

Primary decision factors:

1. Temporal context
- season
- weekday vs weekend

2. User taste profile
- top appellations/domaines
- preferred colors
- historical ratings/rebuy signal (when available in profile)

3. Recency/rotation
- avoid recently drunk same/similar bottles
- keep controlled diversity

4. Cellar state
- availability
- optional maturity window (`drink_from`, `drink_until`) when data quality is sufficient

5. Value signal
- QPR/value bias (avoid always suggesting top expensive picks)

### 3.2 Food mode

Use when user provides dish/ingredient constraints.

Intent:

- maximize food pairing quality first

Primary decision factors:

1. Pairing compatibility (hard priority)
2. User profile affinity
3. Recency avoidance
4. Cellar availability

Hard examples:

- fish/seafood + tannic red: strongly penalized
- red meat + structured red: promoted

### 3.3 Wine mode

Use when user asks for a style/type (e.g. Champagne, light red, fresh white).

Intent:

- satisfy style preference first

Primary decision factors:

1. Style/color match
2. Profile affinity
3. Recency/rotation
4. Cellar availability/value

### 3.4 Surprise mode

Use when user explicitly asks for discovery.

Intent:

- suggest forgotten or atypical cellar options with controlled risk

Primary decision factors:

1. Under-explored cellar segments
2. Distinctiveness vs recent history
3. Sufficient fit to profile (avoid random noise)

UI status:

- not exposed yet in current UI

## 4. Scoring Model (v1)

Total score is weighted sum:

`score = context + profile + query_match + recency + value + maturity + exploration`

Suggested starting weights by mode:

- `generic`: context 0.25, profile 0.25, recency 0.20, value 0.15, maturity 0.10, exploration 0.05
- `food`: pairing/query_match 0.45, profile 0.20, recency 0.20, value 0.10, maturity 0.05
- `wine`: query_match(style) 0.40, profile 0.25, recency 0.20, value 0.10, maturity 0.05
- `surprise`: exploration 0.35, profile 0.20, recency 0.20, value 0.10, maturity 0.10, context 0.05

Notes:

- weights are normalized targets; internal implementation can use arbitrary raw points
- tune with real telemetry, not intuition only

## 5. Hard Rules / Guardrails

These rules override score when violated:

1. Pairing red flags (food mode)
- no clearly incompatible pairing (e.g., powerful tannic red with seafood)

2. Stock integrity
- suggest only `in_stock` cellar bottles for "from your cellar" cards

3. Recency throttle
- do not re-suggest same bottle from immediate recent history unless explicitly requested

4. Output integrity
- keep card payload valid and bounded (3-5 cards max, supported badge/color values)

## 6. LLM Role (strict scope)

LLM should:

- enrich shortlisted candidates with narrative pitch
- adjust ordering slightly (within candidate set)
- assign badge tone/personality

LLM should not:

- ignore hard pairing guardrails
- hallucinate unavailable cellar bottles as "from your cellar"
- replace deterministic candidate selection logic

## 7. Default Behavior

At page entry (no explicit query):

- engine should run in `generic` mode (target behavior)

Current behavior:

- default is effectively `food` without dish query in parts of the pipeline
- this should be migrated to explicit `generic` for clarity and consistency

## 8. Telemetry & Evaluation

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

## 9. Decision Log Template

For each scoring change:

1. change summary
2. affected mode(s)
3. expected UX impact
4. metrics to watch
5. rollback condition

## 10. Next Steps

1. Introduce explicit `generic` in frontend mode enum and edge request body.
2. Align query builder to map:
- no query -> `generic`
- dish intent -> `food`
- style intent -> `wine`
3. Add minimal scoring trace logs (mode + top factors) in dev builds.
4. Create a small golden test dataset for ranking regressions.

