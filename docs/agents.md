# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds the React + TypeScript application code.
- `src/pages/` contains route-level screens (orchestrators); `src/components/` hosts reusable UI components.
- `src/hooks/` contains React hooks; `src/lib/` contains shared utilities and business logic.
- `src/assets/` and `public/` store static assets.
- `supabase/` contains database-related configuration/migrations.
- `dist/` is the production build output (generated).

### Key utilities (`src/lib/`)
- `bottleActions.ts` — `openBottle()`: centralized logic to mark a bottle as drunk (handles quantity decrement + drunk row creation).
- `uploadPhoto.ts` — `uploadPhoto()`: centralized resize → upload → getPublicUrl pipeline for wine label photos.
- `wineMatching.ts` — `findMatches()`: fuzzy matching algorithm to find cave bottles matching an OCR extraction.
- `supabase.ts` — Supabase client instance.
- `batchSessionStore.ts` — In-memory store for batch tasting sessions.
- `taste-profile.ts` — User taste profile computation and serialization for AI prompts.
- `tastingMemories.ts` — Tasting tag extraction, memory selection and serialization for Celestin.
- `recommendationRanking.ts` — Local scoring of cave bottles (color, season, profile, maturity, exploration).
- `recommendationStore.ts` — In-memory cache for recommendation responses (TTL 10 min).
- `contextHelpers.ts` — Shared utilities: season, day of week, bottle formatting, short ID resolution.

### Edge functions (`supabase/functions/`)
- `celestin/` — Unified sommelier AI (recommend, add_wine, log_tasting, question, conversation). See `docs/celestin-architecture.md`.
- `extract-wine/` — OCR label extraction (photo → structured wine data).
- `extract-tasting-tags/` — Extract structured tags from tasting notes.
- `enrich-wine/` — Text-only wine enrichment (aromas, pairings, temperature, character).

### Page component architecture
Pages in `src/pages/` are orchestrators that compose focused sub-components:
- **BottlePage** → `BottleIdentityCard`, `TastingGuideCard`, `TastingSection`, `CaveSection`, `BottleDeleteDialog`
- **AddBottle** → `PhotoPreviewCard`, `WineFormFields`, `QuantitySelector`, `BatchItemForm`
- **RemoveBottle** → `RemoveChooseStep`, `RemoveResultStep`, `BatchTastingItemForm`

## Build, Test, and Development Commands
- `npm install` installs dependencies.
- `npm run dev` starts the Vite dev server with HMR.
- `npm run build` type-checks (`tsc -b`) and produces a production build in `dist/`.
- `npm run preview` serves the production build locally.
- `npm run lint` runs ESLint across the repo.

## Coding Style & Naming Conventions
- TypeScript + React (`.ts`/`.tsx`) with ES modules (`"type": "module"`).
- Use 2-space indentation, and prefer PascalCase for components (e.g., `BottleCard.tsx`).
- Hooks use `useX` naming (e.g., `useZones.ts`).
- ESLint is configured in `eslint.config.js` and ignores `dist/`.

## Testing Guidelines
- No test framework is currently configured and no test files exist.
- If you add tests, keep them next to sources (e.g., `src/pages/Foo.test.tsx`) and add a `test` script to `package.json`.

## Commit & Pull Request Guidelines
- Commit history mixes short imperative messages and Conventional Commit prefixes (e.g., `feat:`, `fix:`, `style:`).
- Prefer concise, action-oriented subjects: "Add bottle editing functionality".
- For PRs, include a clear description, link related issues, and add screenshots for UI changes.

## Security & Configuration Tips
- Supabase config is loaded from `.env.local`. Copy `.env.local.example` and set:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
