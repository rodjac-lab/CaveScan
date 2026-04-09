# Strategie de test

## Objectif

Protéger les parcours critiques sans lancer des tests navigateur à chaque changement.

## Deux étages

### 1. Tests critiques dans le code

Commande:

```bash
npm run test:critical
```

Ils couvrent en priorité:

- routing Celestin côté backend
- flux de création de bouteille hors cave
- garde-fou auth sur refresh token invalide
- configuration de déploiement SPA

### 2. Smoke tests Playwright

Commande:

```bash
npm run test:smoke
```

Pré-requis:

- `PLAYWRIGHT_BASE_URL`
- `PLAYWRIGHT_TEST_EMAIL`
- `PLAYWRIGHT_TEST_PASSWORD`
- `PLAYWRIGHT_DRUNK_BOTTLE_ID` pour le test de sauvegarde dégustation

Ces tests ne sont pas lancés par défaut. Ils servent pour les changements qui touchent des parcours critiques.

## Les 3 smoke tests

1. `auth-and-app-load`
   login + ouverture réelle de l'app

2. `lazy-route-navigation`
   navigation sur plusieurs routes lazy critiques sans page blanche

3. `bottle-tasting-save`
   sauvegarde d'une note de dégustation sur une fiche bouteille déjà `drunk`, vérifiée après reload

## Quand lancer quoi

### Lancer seulement `npm run test:critical`

Quand on touche principalement:

- `supabase/functions/**`
- prompts Celestin
- logique mémoire backend
- helpers métier purs
- docs

### Lancer aussi `npm run test:smoke`

Quand on touche:

- `src/App.tsx`
- `src/hooks/useAuth.ts`
- `src/hooks/useBottles.ts`
- `src/components/TastingSection.tsx`
- `src/pages/BottlePage.tsx`
- `src/pages/RemoveBottle.tsx`
- `src/pages/Login.tsx`
- `vercel.json`
- `vite.config.ts`
- PWA / assets publics
- routing lazy / auth / upload / scan frontend

## Philosophie

- Peu de smoke tests, mais stables et utiles.
- Les tests navigateur protègent les parcours vitaux.
- Les tests code-only tournent souvent.
