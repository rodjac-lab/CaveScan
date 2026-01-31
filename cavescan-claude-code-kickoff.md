# CaveScan — Claude Code Kickoff

## Contexte

Tu développes CaveScan, une PWA de gestion de cave à vin pour un utilisateur unique.
Le PRD complet est dans `docs/PRD.md`. Lis-le en entier avant de coder quoi que ce soit.

Le développeur qui te pilote n'est pas codeur — il spécifie, valide, et itère avec toi.
Écris du code propre, simple, bien commenté. Pas d'abstractions prématurées.

## Stack

- **Frontend** : React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui
- **Backend / DB** : Supabase (PostgreSQL + Storage + Edge Functions)
- **Vision AI** : Claude Sonnet API (extraction étiquettes vin)
- **Hébergement** : Vercel
- **PWA** : vite-plugin-pwa (manifest + service worker)

## Structure projet

```
cavescan/
├── docs/
│   └── PRD.md                    # Product Requirements (source de vérité)
├── public/
│   ├── manifest.json
│   └── icons/                    # PWA icons
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── ui/                   # shadcn/ui components
│   │   ├── BottleCard.tsx        # Carte bouteille dans la liste
│   │   ├── BottleDetail.tsx      # Fiche détail + note dégustation
│   │   ├── CameraCapture.tsx     # Prise de photo (entrée + sortie)
│   │   ├── ExtractionReview.tsx  # Résultat Vision → validation
│   │   ├── ZonePicker.tsx        # Sélection zone + étagère
│   │   ├── MatchSelector.tsx     # Sélection quand plusieurs matchs (sortie)
│   │   └── RecentDrinks.tsx      # Bandeau sorties récentes
│   ├── pages/
│   │   ├── Home.tsx              # Inventaire + sorties récentes
│   │   ├── AddBottle.tsx         # Flux entrée
│   │   ├── RemoveBottle.tsx      # Flux sortie
│   │   ├── BottlePage.tsx        # Détail bouteille
│   │   ├── Search.tsx            # Recherche
│   │   └── Settings.tsx          # Zones de stockage
│   ├── lib/
│   │   ├── supabase.ts           # Client Supabase
│   │   ├── vision.ts             # Appel Claude Vision API
│   │   ├── matching.ts           # Logique de matching sortie
│   │   └── types.ts              # Types TypeScript
│   └── hooks/
│       ├── useBottles.ts         # CRUD bouteilles
│       ├── useZones.ts           # CRUD zones
│       └── useCamera.ts          # Accès caméra
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   ├── seed.sql                  # Zones par défaut
│   └── functions/
│       └── extract-label/        # Edge Function : appel Claude Vision
│           └── index.ts
├── .env.local                    # SUPABASE_URL, SUPABASE_ANON_KEY, ANTHROPIC_API_KEY
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
└── CLAUDE.md                     # Ce fichier (instructions pour Claude Code)
```

## Ordre de développement

Développe dans cet ordre. Chaque étape doit être fonctionnelle avant de passer à la suivante.

### Étape 1 — Fondations
1. Init projet Vite + React + TypeScript + Tailwind + shadcn/ui
2. Config PWA (manifest, service worker basique)
3. Config Supabase : migration SQL (`zones` + `bottles`), seed zones par défaut
4. Client Supabase dans `lib/supabase.ts`
5. Routing (react-router-dom) : Home, Add, Remove, Bottle, Search, Settings
6. Layout mobile-first avec navigation bottom bar

### Étape 2 — Entrée par photo
1. `CameraCapture.tsx` : accès caméra, prise de photo
2. Edge Function `extract-label` : reçoit image base64, appelle Claude Sonnet, retourne JSON
3. `ExtractionReview.tsx` : affiche le résultat, permet corrections
4. `ZonePicker.tsx` : sélection zone + étagère
5. Flux complet `AddBottle.tsx` : photo → extraction → review → zone → save
6. Upload photo vers Supabase Storage, stockage URL en base

### Étape 3 — Inventaire
1. `Home.tsx` : liste des bouteilles `in_stock`
2. `BottleCard.tsx` : miniature avec photo, domaine, millésime, couleur, zone
3. Filtres : couleur, zone, millésime
4. `BottlePage.tsx` : fiche détail complète

### Étape 4 — Sortie par scan
1. `RemoveBottle.tsx` : photo → extraction → matching avec inventaire
2. `matching.ts` : logique de match (domaine + appellation + millésime + couleur)
3. `MatchSelector.tsx` : si plusieurs matchs, liste pour choisir
4. Marquage `status = 'drunk'`, `drunk_at = now()`
5. `RecentDrinks.tsx` : bandeau en haut de Home, dernières 5 sorties

### Étape 5 — Note de dégustation
1. Dans `BottlePage.tsx` : si `status = 'drunk'`, afficher champ `tasting_note`
2. Sauvegarde auto (debounce) ou bouton save discret
3. Affichage de la note dans `RecentDrinks.tsx` (icône si note présente)

### Étape 6 — Recherche + Settings
1. `Search.tsx` : recherche texte libre sur domaine, appellation, millésime
2. `Settings.tsx` : CRUD zones de stockage (ajouter, renommer, réordonner, supprimer)

## Conventions

### Code
- TypeScript strict, pas de `any`
- Composants fonctionnels, hooks custom pour la logique
- Noms de fichiers en PascalCase pour les composants, camelCase pour le reste
- Commentaires en français pour le métier, en anglais pour le technique
- Pas de state management global (pas de Redux/Zustand). Props + hooks suffisent pour le MVP

### UI / UX
- Mobile-first, optimisé pour usage une main
- Les boutons d'action principaux (Ajouter, Sortir) doivent être accessibles au pouce
- Palette sobre : fond sombre, accents bordeaux/vin
- Transitions fluides entre les étapes des flux (entrée et sortie)
- Feedback visuel immédiat sur chaque action (toast, animation)

### Base de données
- Toute la logique métier côté client (Supabase = stockage + auth future)
- L'Edge Function `extract-label` est le seul endroit qui appelle l'API Anthropic
- Pas de RLS au MVP (utilisateur unique), mais structurer pour l'ajouter facilement

### Sécurité
- La clé API Anthropic ne doit JAMAIS être côté client
- Elle vit dans les variables d'environnement de la Edge Function Supabase
- Le client appelle la Edge Function, pas l'API Anthropic directement

## Variables d'environnement

```
# .env.local (frontend)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# Supabase Edge Function secrets
ANTHROPIC_API_KEY=sk-ant-...
```

## Prompt Claude Vision

Utilisé dans la Edge Function `extract-label` :

```
Analyse cette photo d'étiquette de vin et extrais les informations suivantes
au format JSON strict (pas de texte avant ou après le JSON) :

{
  "domaine": "nom du domaine/château/producteur",
  "appellation": "appellation d'origine (AOC/AOP/DOC/DOCG...)",
  "millesime": année (nombre entier ou null si non visible),
  "couleur": "rouge" | "blanc" | "rosé" | "bulles",
  "region": "région viticole",
  "cepage": "cépage principal si mentionné",
  "confidence": 0.0-1.0
}

Si une information n'est pas visible sur l'étiquette, utilise null.
Pour la couleur, déduis-la de l'appellation si elle n'est pas explicite
(ex: Sancerre → blanc, Châteauneuf-du-Pape → rouge, Champagne → bulles).
```

## Logique de matching (sortie)

Pour matcher une photo de sortie avec l'inventaire :
1. Extraire les infos via Claude Vision (même prompt)
2. Chercher dans `bottles WHERE status = 'in_stock'`
3. Score de matching :
   - domaine exact (case-insensitive, accent-insensitive) → +3 points
   - appellation exacte → +2 points
   - millésime exact → +2 points
   - couleur exacte → +1 point
4. Seuil minimum : 5 points pour proposer un match
5. Si 1 match ≥ 5 → proposition directe
6. Si plusieurs matchs ≥ 5 → liste triée par score
7. Si 0 match → message "Bouteille non trouvée dans l'inventaire"
