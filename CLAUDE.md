# Cavescan - Project Memory

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
- **Cheers! (single)** : photo → OCR → match en cave ou hors cave → notes de dégustation → partage
- **Cheers! (batch)** : sélection multiple → traitement parallèle → revue des résultats → sauvegarde groupée
- **Détail bouteille** : consulter infos, ajouter/modifier notes, photos dégustation, partager
- **Édition bouteille** : modifier domaine, cuvée, appellation, millésime, emplacement
- **Réglages** : gestion des zones de stockage (grille lignes × colonnes)

## When Debugging

- Do not stop until the bug is fully fixed AND verified
- If fixing one thing might break another, check the connected code
- Tell the user exactly what you fixed and what they should test

## Documentation de référence

Le dossier `docs/` contient la documentation détaillée du projet. Consulter au besoin :
- `docs/prd.md` — Vision produit, décisions, cible utilisateur
- `docs/ux-spec.md` — Spécifications UX et navigation
- `docs/design-system.md` — Palette, typographie, composants
- `docs/backlog.md` — Backlog priorisé (P0/P1/P2)
- `docs/agents.md` — Conventions de code et structure projet
- `docs/personas.md` — Persona cible (Philippe)
- `docs/benchmark-ocr-notes.md` — Benchmark OCR (Claude vs Gemini)

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
