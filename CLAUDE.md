# Celestin (ex-CaveScan)

## Stack technique

- Frontend : React PWA (Vite, TypeScript, Tailwind, shadcn/ui)
- Backend : Supabase (Postgres + pgvector, Edge Functions Deno, Auth, Storage)
- Hosting : Vercel
- LLM Celestin : Gemini 2.5 Flash (primaire) → GPT-4.1 mini (fallback)
- LLM OCR scan : Gemini 2.5 Flash (primaire en prod) → Claude Haiku 4.5 (fallback)
- LLM enrichissement : Gemini 2.5 Flash

## Architecture Celestin (résumé)

Message utilisateur → `buildCelestinRequestBody()` (cave + profil + tasting memories + conversation state + profil compilé) → Edge function `celestin/` → **Turn Interpreter** (routing déterministe state-aware, pas de LLM) → **Prompt Builder** (system prompt adapté au cognitive mode) → **LLM** (Gemini primaire, GPT fallback, temp 0.5) → **Response Policy** (garde-fous déterministes post-LLM) → **computeNextState()** (state machine 6 états) → JSON response avec message + ui_action + action_chips + _nextState.

## Structure Supabase

- Tables principales : bottles, zones, events, user_taste_profiles, chat_sessions, chat_messages, user_memory_facts
- Edge functions : celestin (--no-verify-jwt), extract-wine (--no-verify-jwt), enrich-wine, extract-tasting-tags, extract-chat-insights, generate-embedding, notify-signup
- pgvector : colonne embedding vector(1536) sur bottles
- Deploy : `npx supabase functions deploy <nom> --project-ref flqsprbdcycweshvrcyx`

## Documentation — Lecture IMPÉRATIVE

| Tâche | Docs à lire AVANT |
|-------|-------------------|
| Toucher à Celestin (edge function, prompt, routing, state) | `docs/celestin-architecture.md` |
| Toucher à la mémoire, profil, embeddings, ranking | `docs/README.md`, `docs/celestin-memory-doctrine.md`, `docs/celestin-memory-runtime-architecture.md`, `docs/celestin-memory-compilation-events.md` |
| Toucher à l'UI, composants, styles | `docs/design-system.md` |
| Toucher aux flows utilisateur, navigation, pages | `docs/ux-spec.md` |
| Comprendre la vision produit, persona, décisions | `docs/prd.md` |
| Prioriser le travail | `docs/backlog.md` |
| Conventions de code | `docs/agents.md` |

## Décisions techniques actées

- Celestin : Gemini 2.5 Flash en primaire, GPT-4.1 mini en fallback
- OCR scan : Gemini Flash en primaire prod (10× moins cher, suffisant en single-bottle), Claude Haiku en fallback (benchmark fév 2026 : 19/20, légèrement plus fiable). Switch via secret `PRIMARY_PROVIDER`
- `extract-wine`, `celestin`, `extract-chat-insights` et `generate-embedding` déployés avec `--no-verify-jwt` (obligatoire, sinon 401)
- Multi-bouteilles : feature-flagged OFF (`ENABLE_MULTI_BOTTLE_SCAN = false`) — qualité OCR insuffisante
- Mémoire : architecture cible `Supabase + compiled profile markdown + tasting memories + SQL ciblé`
- Cross-session : localStorage TTL 7j, max 4 sessions
- Rating : demi-étoiles NUMERIC 0.5-5

## About the User

The user is not a professional developer but is learning quickly and wants to improve. Use technical terms when appropriate, but briefly explain them on first use. Treat them as a capable person who is building real skills, not someone who needs hand-holding.

## Before Committing Any Changes

**STOP. Do not commit immediately after making changes. Follow these steps:**

1. **Run the build** to check for errors:
   ```
   npm run build
   ```
   If the build fails, fix the errors before continuing.

2. **Trace the code flow** - You cannot see the running app, so you must trace through the code:
   - Start from the component/function you changed
   - Follow what happens next: What calls this? What does this call?
   - Read the connected components and check they still receive the right data
   - Look for broken links: renamed functions, changed props, missing imports

3. **Tell the user what to test manually** - Be specific:
   - "Please test: open the app, click X, then Y, and check that Z appears"
   - List the exact steps so the user can verify before you commit

4. **Wait for the user to confirm** before committing, unless they explicitly said to commit directly.

5. **For matching or comparison logic** - Trace through edge cases:
   - Two wines from the same region but different producers
   - Wines that share some details but not all
   - Exact duplicates vs. similar wines

## Common User Flows (remind user to test these)

When making UI changes, remind the user to test the relevant flows:
- **Encaver** : photo étiquette → OCR → correction manuelle → choix zone/étagère → sauvegarde
- **Déguster (single)** : photo → OCR → match en cave ou hors cave → notes de dégustation → partage
- **Déguster (batch)** : sélection multiple → traitement parallèle → revue des résultats → sauvegarde groupée
- **Détail bouteille** : consulter infos, ajouter/modifier notes, photos dégustation, partager
- **Édition bouteille** : modifier domaine, cuvée, appellation, millésime, emplacement
- **Réglages** : gestion des zones de stockage (grille lignes × colonnes)

## When Debugging

- Do not stop until the bug is fully fixed AND verified
- If fixing one thing might break another, check the connected code
- Tell the user exactly what you fixed and what they should test

## Règle de fin de session

Avant de terminer une session de travail, mettre à jour le fichier MEMORY.md
(`~/.claude/projects/.../memory/MEMORY.md`) avec une section **"État actuel"** contenant :
- Ce qui a été fait durant la session
- Ce qui reste à faire
- Les décisions prises et leur justification

Ce fichier est automatiquement chargé au début de chaque conversation.

## Quick Reference

- Dev server: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
