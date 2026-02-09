# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds the React + TypeScript application code.
- `src/pages/` contains route-level screens; `src/components/` hosts reusable UI components.
- `src/hooks/` and `src/lib/` contain shared logic and utilities.
- `src/assets/` and `public/` store static assets.
- `supabase/` contains database-related configuration/migrations.
- `dist/` is the production build output (generated).

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
