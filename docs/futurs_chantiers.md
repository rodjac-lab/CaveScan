# Futurs chantiers

## Simplification

### 1. Debug

Fichier :
- `src/pages/Debug.tsx`

Pourquoi :
- trop de responsabilités dans un seul écran
- mélange backfills, evals, audit mémoire, debug profil, debug cross-session

Piste :
- découper en panneaux dédiés
  - `DebugMemoryPanel`
  - `DebugEvalPanel`
  - `DebugBackfillPanel`
  - `DebugProfilePanel`

### 2. AddBottle

Fichier :
- `src/pages/AddBottle.tsx`

Pourquoi :
- très gros orchestrateur de flow
- mélange single bottle, batch, prefill Celestin, OCR, upload, save, enrich

Piste :
- extraire un `useAddBottleFlow`
- séparer le flow single du flow batch
- garder la page comme shell de routing

### 3. CeSoirModule

Fichier :
- `src/components/discover/CeSoirModule.tsx`

Pourquoi :
- mélange UI chat, persistence, wiring Celestin, inline questionnaire, photo flows, cards, wine actions

Piste :
- extraire
  - `useCelestinChatSession`
  - `useCelestinPhotoFlow`
  - `ChatThread`
  - `ChatComposer`

### 4. RemoveBottle

Fichier :
- `src/pages/RemoveBottle.tsx`

Pourquoi :
- flow encore dense
- batch + single + matching + result step dans le même fichier

Piste :
- séparer orchestration, matching et rendu des étapes

### 5. Backend Celestin

Fichier :
- `supabase/functions/celestin/index.ts`

Pourquoi :
- gros fichier d’orchestration backend

Piste :
- découpage progressif, pas refacto brutal
  - `build-context`
  - `build-user-prompt`
  - `response-policy`
  - `provider-call`

### 6. Evals Celestin

Fichier :
- `src/lib/celestinEval.ts`

Pourquoi :
- runner, assertions et rendu de rapport encore trop regroupés

Piste :
- séparer
  - exécution des scénarios
  - assertions
  - génération des rapports

## Ordre recommandé

1. `Debug.tsx`
2. `AddBottle.tsx`
3. `CeSoirModule.tsx`
4. `RemoveBottle.tsx`
5. `supabase/functions/celestin/index.ts`
6. `src/lib/celestinEval.ts`

## Note

Ne pas rouvrir tout de suite :
- `src/lib/chatPersistence.ts`
- `src/lib/tastingMemoryFilters.ts`
- `src/lib/tastingMemoryRanking.ts`

Ils viennent d’être simplifiés et sont dans un bon état.
