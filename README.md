# CaveScan

PWA mobile-first pour gérer une cave à vin avec le moins de friction possible.

Promesse produit: `Photo -> c'est rangé. Photo -> c'est sorti.`

## Ce que fait l'app aujourd'hui

- Scan d'étiquette (ou galerie) avec extraction IA des infos vin
- Validation/correction rapide des champs (domaine, cuvée, appellation, millésime, couleur)
- Ajout en cave avec zone + étagère
- Mode batch pour scanner plusieurs bouteilles d'un coup
- Sortie de cave par photo avec matching sur l'inventaire
- Fiche bouteille (édition, notes, photos avant/arrière)
- Auth Supabase (signup/login) + données scopées par utilisateur via RLS

## Stack

- Frontend: React 19, TypeScript, Vite, Tailwind v4, Radix UI
- Backend/Data: Supabase (Postgres, Auth, Edge Functions)
- OCR/Extraction: Edge Function `extract-wine` avec fallback multi-provider (Claude/Gemini)
- PWA: `vite-plugin-pwa`

## Structure utile

```txt
src/
  pages/            Écrans principaux (Home, AddBottle, RemoveBottle, etc.)
  components/       UI métier + composants Radix
  hooks/            Hooks d'accès data/auth
  lib/              Client supabase, types, utilitaires image/tracking
supabase/
  migrations/       Schéma + RLS + évolutions
  functions/
    extract-wine/   OCR d'étiquette (Edge Function)
docs/               PRD, UX, backlog, benchmarks OCR
```

## Démarrage rapide

### 1) Prérequis

- Node.js 20+ (22 recommandé)
- npm
- Un projet Supabase

### 2) Installer

```bash
npm ci
```

### 3) Config frontend

```bash
cp .env.local.example .env.local
```

Puis renseigner:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4) Lancer

```bash
npm run dev
```

### 5) Tester depuis un téléphone (même réseau Wi‑Fi)

Par défaut, Vite écoute sur `localhost` (accessible uniquement sur la machine qui lance le serveur).
Pour ouvrir l'app sur un autre appareil (ex: téléphone), lance:

```bash
npm run dev -- --host 0.0.0.0 --port 4173
```

Puis ouvre l'URL affichée sur la ligne `Network` (ex: `http://192.168.x.x:4173`).

## Scripts

- `npm run dev` : serveur local Vite
- `npm run build` : typecheck + build production
- `npm run lint` : lint ESLint
- `npm run preview` : preview du build

## Supabase

### Migrations

Le schéma est versionné dans `supabase/migrations/`.

### Edge Function OCR

La fonction est dans `supabase/functions/extract-wine/index.ts`.

Secrets attendus côté Supabase:

- `ANTHROPIC_API_KEY` (optionnel si Gemini est configuré)
- `GEMINI_API_KEY` (optionnel si Claude est configuré)
- `PRIMARY_PROVIDER` (`claude` par défaut, ou `gemini`)
- `ANTHROPIC_MODEL` (optionnel, override du modèle Claude)

La fonction essaie le provider principal puis bascule automatiquement sur l'autre en cas d'échec.

## Déploiement (Supabase + Vercel)

### 1) Initialiser Supabase

1. Créer un projet Supabase.
2. Appliquer les migrations de `supabase/migrations/` (via CLI ou SQL editor).
3. Vérifier que les policies RLS sont bien actives.

### 2) Déployer la fonction OCR

1. Déployer `supabase/functions/extract-wine`.
2. Configurer les secrets de la fonction:
   - `ANTHROPIC_API_KEY` et/ou `GEMINI_API_KEY`
   - `PRIMARY_PROVIDER` (`claude` ou `gemini`)
   - `ANTHROPIC_MODEL` (optionnel)
3. Tester un appel de la fonction depuis le dashboard Supabase.

### 3) Configurer Vercel

1. Importer le repo dans Vercel.
2. Ajouter les variables d'environnement frontend:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Lancer le premier déploiement.

### 4) Vérification post-déploiement

1. Signup/Login fonctionnels.
2. Liste des bouteilles accessible.
3. Ajout d'une bouteille avec extraction OCR.
4. Sortie d'une bouteille et mise à jour du statut.
5. Pas d'erreur CORS sur les appels Edge Function.

## Troubleshooting

### Erreur Rollup: `Cannot find module @rollup/rollup-linux-x64-gnu`

Ce problème apparaît parfois avec les dépendances optionnelles npm (souvent visible sous WSL).

Procédure simple:

```bash
rm -rf node_modules package-lock.json
npm install
```

Si tu développes sous WSL, fais l'installation dans le même environnement que celui qui exécute `npm run build`.

## Documentation produit

- `docs/prd.md`
- `docs/ux-spec.md`
- `docs/backlog.md`
- `docs/benchmark-ocr-notes.md`
