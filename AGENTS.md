# AGENTS.md

## Purpose

This repo is not just a cellar app. The product goal is **Celestin**, a personal AI sommelier that knows the user's cellar, taste profile, and tasting memories.

The core product metric is **conversation quality**, not raw CRUD throughput.

## Read This First

Before changing code, read the docs that match the task:

- `CLAUDE.md`
- `docs/celestin-architecture.md` for Celestin orchestration, prompts, routing, or conversation state
- `docs/README.md` for the active documentation map
- `docs/celestin-memory-doctrine.md` for memory principles and source hierarchy
- `docs/celestin-memory-runtime-architecture.md` for `Supabase + compiled profile + SQL runtime`
- `docs/celestin-memory-compilation-events.md` for profile update triggers and patch logic
- `docs/design-system.md` for UI, spacing, typography, colors, or component styling
- `docs/ux-spec.md` for route behavior, screen structure, and user flows
- `docs/prd.md` for product intent, personas, and what matters
- `docs/backlog.md` for current priorities and already-made tradeoffs
- `docs/agents.md` for supplementary repo conventions

Do not treat this as a generic React app. Product decisions are documented and many tradeoffs are intentional.

## Current Stack

- Frontend: React 19, TypeScript, Vite, Tailwind v4, Radix UI
- Backend: Supabase Postgres, Auth, Storage, Edge Functions
- Hosting: Vercel
- AI:
  - Celestin conversation: Gemini 2.5 Flash primary, GPT-4.1 mini fallback in current code
  - OCR extraction: `extract-wine`
  - Memory embeddings: OpenAI `text-embedding-3-small`

## Local Environment

Expected local commands:

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run test`
- `npx supabase status`
- `npx vercel`

Important environment notes:

- Frontend requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- This repo is linked to:
  - Supabase project ref `flqsprbdcycweshvrcyx`
  - Vercel project `rodjac-labs-projects/cavescan`
- Vercel has distinct `development`, `preview`, and `production` environments
- If `vercel env pull` seems to remove Supabase vars locally, check which Vercel environment actually contains them before editing `.env.local` manually

## Repo Map

### Frontend

- `src/App.tsx` sets up route layout, auth gating, lazy loading, and bottom nav behavior
- `src/pages/` contains route-level orchestrators
- `src/components/` contains reusable UI and feature components
- `src/components/discover/` contains most of the Celestin chat UI
- `src/hooks/` contains Supabase-backed data hooks and profile hooks
- `src/lib/` contains business logic, matching, memory, ranking, persistence, sharing, OCR helpers, and Celestin request building

### Backend / Supabase

- `supabase/migrations/` is the source of truth for schema evolution
- `supabase/functions/celestin/` is the main AI orchestration backend
- `supabase/functions/extract-wine/` handles OCR label extraction
- `supabase/functions/extract-chat-insights/` extracts structured memory facts
- `supabase/functions/extract-tasting-tags/` structures tasting notes
- `supabase/functions/enrich-wine/` enriches wines with aromas, pairings, serving info
- `supabase/functions/generate-embedding/` powers semantic memory

### Docs / Evaluation

- `docs/` contains product, UX, architecture, and planning docs
- `evals/` contains Celestin fixtures and conversation scenarios
- `benchmark/` contains OCR benchmark tooling and results

## Hotspots

These files are large and behavior-dense. Read surrounding code before changing them:

- `src/pages/AddBottle.tsx`
- `src/pages/RemoveBottle.tsx`
- `src/pages/Settings.tsx`
- `src/pages/Debug.tsx`
- `src/lib/tastingMemories.ts`
- `src/lib/chatPersistence.ts`
- `src/lib/celestinEval.ts`
- `supabase/functions/celestin/index.ts`
- `supabase/functions/celestin/turn-interpreter.ts`

`src/pages/Decouvrir.tsx` is intentionally small. Most Celestin UI complexity lives under `src/components/discover/` plus `src/lib/celestinConversation.ts`, `src/lib/celestinChatRequest.ts`, and memory/profile helpers.

## Architectural Rules

### Celestin

- The backend uses a deterministic **Turn Interpreter** before the LLM
- Dialogue phase and cognitive mode are separate concepts
- Response policy strips unsafe or low-confidence UI actions after generation
- Memory injection is structured, not just raw prompt stuffing
- If you change routing, prompt building, memory usage, or state transitions, you must read `docs/celestin-architecture.md`
- If you change memory compilation, profile usage, or retrieval strategy, you must read the 3 active memory docs in `docs/README.md`

### Scanner / OCR

- Adding a bottle and removing a bottle are separate flows with different UX and business logic
- Multi-bottle scan is feature-flagged off
- OCR extraction failure should degrade gracefully to manual correction, not dead-end the flow

### Supabase

- RLS and user scoping matter; do not make casual schema or query changes
- Some edge functions are intentionally deployed with `--no-verify-jwt`; do not “fix” this blindly
- When touching auth or edge functions, verify both deployment config and in-function auth behavior

## How To Work In This Repo

- Start by stating what you are going to inspect or change and why
- Keep explanations short and readable for a non-developer founder
- Prefer describing outcomes and risks over narrating shell commands
- Separate confirmed facts from hypotheses and recommendations
- Do not make product-shaping changes from code alone when docs already specify intent

## Validation Rules

Before proposing a commit or saying work is done:

1. Run `npm run build`
2. Trace the code path beyond the edited file
3. Check connected flows for regressions
4. Tell the user exactly what to test manually
5. Wait for confirmation before committing unless explicitly told to commit directly

For matching, OCR, recommendation, or conversation changes, always think through edge cases:

- similar wines from different producers
- same wine with different vintages
- in-cellar vs out-of-cellar tasting flows
- short follow-up messages after a recommendation
- incomplete OCR extraction payloads

## Manual Flows Worth Testing

- Encaver: photo -> OCR -> correction -> zone/shelf -> save
- Déguster single: photo -> OCR -> cave match or out-of-cellar -> tasting note -> save/share
- Déguster batch: multi-photo -> extraction review -> batch save
- Bottle detail: identity, cave data, tasting history, share, edit
- Celestin: recommendation, follow-up refinement, memory recall, photo + text flows
- Settings: zone CRUD, questionnaire profile, logout, invite

## Common Pitfalls

- `vercel env pull` may pull the wrong environment for local work
- `src/lib/supabase.ts` falls back to placeholder credentials, so missing env vars can fail softly at startup
- `AddBottle` and `RemoveBottle` contain a lot of state and step transitions; make narrow changes
- `supabase/.temp/` may change locally after CLI operations; do not confuse that with product code
- The repo still contains some `CaveScan` naming while product branding has shifted toward `Celestin`

## Deployment Notes

- Frontend: Vercel
- Database and edge functions: Supabase
- Common function deploy pattern:
  - `npx supabase functions deploy <name> --project-ref flqsprbdcycweshvrcyx`
- Some functions must keep `--no-verify-jwt`; confirm before changing deploy assumptions

## If You Are Updating This File

- Keep it short
- Keep it specific to this repo
- Prefer operational guidance over generic style advice
- Update it when architecture, deployment flow, or critical product constraints change
