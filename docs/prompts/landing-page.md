# Prompt Claude Code — Landing Page d'installation PWA CaveScan

## Contexte
CaveScan est une PWA de gestion de cave à vin. On doit ajouter une landing page d'installation sur la route `/` pour les nouveaux visiteurs. L'app existante reste inchangée sur ses routes actuelles.

## Objectif
Créer une landing page élégante sur `/` qui :
1. Détecte si l'app est déjà installée (mode standalone) → redirige vers `/cave`
2. Détecte si l'utilisateur est déjà connecté → redirige vers `/cave`
3. Sinon, affiche une page marketing avec guide d'installation adapté au device (Android/iOS/Desktop)

## Fichiers à créer/modifier

### 1. CRÉER `src/pages/Landing.tsx`

Page complète avec les sections suivantes, de haut en bas (la page scrolle) :

#### Section 1 — Header Brand
- "CAVESCAN" en Playfair Display, 12px, weight 600, letter-spacing 3px, uppercase, couleur var(--accent)
- Centré, padding-top safe-area + 20px

#### Section 2 — Hero avec screenshot
- Un conteneur qui simule un téléphone (coins arrondis 28px, ombre portée douce, légère rotation perspective 3D : `perspective(800px) rotateY(-4deg) rotateX(2deg)`)
- À l'intérieur : l'image `/screenshot-cave.png` (le vrai screenshot de l'app) en object-cover, avec un faux notch/island en haut
- Quelques cercles décoratifs flottants en arrière-plan avec les couleurs des vins (--red-wine, --white-wine, --rose-wine) en opacity 0.15, avec une animation float lente

#### Section 3 — Proposition de valeur
- Titre : "Votre cave, _sublimée._" — "sublimée" en italic et couleur var(--accent)
  - Playfair Display, 28px, weight 700
- Sous-titre : "Scannez, encavez, partagez.\nVotre cave à vin dans votre poche."
  - DM Sans, 15px, weight 400, couleur var(--text-secondary)
  - max-width 280px, centré

#### Section 4 — Comment ça marche (3 feature cards)
- Label "COMMENT ÇA MARCHE" en uppercase, 10px, letter-spacing 2px, couleur var(--text-muted), centré
- 3 cartes verticales (fond blanc, radius 14px, shadow-sm, padding 18px 20px) :

  **Carte 1 — Scannez l'étiquette**
  - Icône : SVG camera (stroke, 20px, couleur accent dans un carré 40px radius 10px fond accent-bg)
  - Titre : Playfair Display, 15px, 600
  - Description : "Photographiez une bouteille. CaveScan reconnaît le vin et remplit la fiche pour vous." — DM Sans, 13px, 400, couleur text-secondary

  **Carte 2 — Gérez votre cave**
  - Icône : SVG grille (rect + cercle)
  - Description : "Encavez, sortez, suivez vos stocks. Chaque bouteille a sa fiche avec millésime, appellation et notes."

  **Carte 3 — Partagez vos dégustations**
  - Icône : SVG smiley malicieux de CaveScan (cercle + smile + yeux en points). C'est l'icône signature de l'app :
    ```
    <circle cx="12" cy="12" r="10"/>
    <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
    <line x1="9" y1="9" x2="9.01" y2="9" stroke-width="3" stroke-linecap="round"/>
    <line x1="15" y1="9" x2="15.01" y2="9" stroke-width="3" stroke-linecap="round"/>
    ```
  - Description : "Notez vos impressions et partagez-les en un tap via WhatsApp avec vos amis amateurs."

#### Section 5 — Zone d'installation (conditionnelle selon device)

**Détection du device :**
```typescript
function getDeviceContext(): 'installed' | 'ios' | 'android' | 'desktop' {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as any).standalone;
  if (isStandalone) return 'installed';
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}
```

**Variante Android :**
- Intercepter `beforeinstallprompt` dans un useEffect, stocker l'event dans un useRef
- Afficher un bouton "Installer CaveScan" :
  - Fond var(--accent), texte blanc, DM Sans 15px 600, padding 16px 36px, radius 10px
  - Icône download SVG à gauche
  - Box-shadow avec teinte dorée : `0 2px 12px rgba(184,134,11,0.20)`
  - Au click : déclencher prompt() sur l'event stocké
- Si beforeinstallprompt non disponible → afficher la variante iOS en fallback

**Variante iOS :**
- Titre "Installer en 2 étapes" — DM Sans, 14px, 600
- Une carte blanche (radius 14px, shadow-md, padding 24px) avec 2 étapes :
  - Étape 1 : Cercle doré avec "1" + texte "Appuyez sur [icône partager Safari]" + sous-texte "Le bouton Partager en bas de Safari"
  - Étape 2 : Cercle doré avec "2" + texte "Choisissez [icône +]" + sous-texte "« Sur l'écran d'accueil »"
  - Les icônes Safari sont des petits badges (28px, fond accent-bg, border, radius 6px) avec le SVG dedans
  - Séparateur 1px entre les 2 étapes
- Une flèche animée (pulsation douce) en position fixed en bas, pointant vers le bas, pour attirer l'attention vers la barre Safari. Couleur accent, opacity 0.5.

**Variante Desktop :**
- Titre "Scannez pour installer sur mobile" — DM Sans, 15px, 500
- Un faux QR code en SVG (avec les 3 finder patterns + modules aléatoires + un carré central doré avec "C" en Playfair) dans une carte blanche
- En dessous : "cavescan.app" en texte muted

**Pour toutes les variantes**, en dessous :
- Ligne de réassurance : "Gratuit · Léger · Prêt en 30 secondes"
  - DM Sans, 12px, 400, couleur text-muted
  - Les "·" en couleur accent à 50% opacity

#### Animations d'entrée
- Chaque section apparaît avec un fadeUp (translateY 16px → 0, opacity 0 → 1) avec un délai croissant (0.2s, 0.4s, 0.6s, 0.7s, 0.9s)
- Les cercles décoratifs ont une animation float lente (6-7s ease-in-out infinite)

#### Styles
- Utiliser les CSS variables existantes du design system (var(--bg), var(--accent), etc.)
- Utiliser Tailwind quand possible, CSS inline ou un bloc <style> pour les animations custom
- La page doit respecter le max-width 430px déjà en place sur #root
- Pas de dépendances supplémentaires

### 2. CRÉER `public/screenshot-cave.png`
Copier le fichier screenshot fourni dans public/. Le fichier est déjà présent dans le repo à l'emplacement indiqué par l'utilisateur.

### 3. MODIFIER `src/App.tsx`

Ajouter la route Landing :

```typescript
import Landing from './pages/Landing'
```

Dans AppLayout, modifier la logique :
- Les pages auth (/login, /signup) restent inchangées
- Ajouter `/` comme route vers `<Landing />` HORS du ProtectedRoute
- Les routes protégées restent inchangées

```typescript
function AppLayout() {
  const location = useLocation()
  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup'
  const isLanding = location.pathname === '/'

  if (isAuthPage) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
      </Routes>
    )
  }

  if (isLanding) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
      </Routes>
    )
  }

  return (
    <ProtectedRoute>
      <div className="flex h-screen flex-col overflow-hidden">
        <main className="flex flex-1 flex-col min-h-0 pb-20">
          <Routes>
            <Route path="/cave" element={<Home />} />
            <Route path="/add" element={<AddBottle />} />
            <Route path="/remove" element={<RemoveBottle />} />
            <Route path="/bottle/:id" element={<BottlePage />} />
            <Route path="/bottle/:id/edit" element={<EditBottle />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </ProtectedRoute>
  )
}
```

### 4. Vérifier le manifest.json (dans public/)

S'assurer que `start_url` pointe vers `/cave` (pas `/`) pour que l'app installée arrive directement dans l'app et pas sur la landing :

```json
{
  "start_url": "/cave",
  "display": "standalone",
  "background_color": "#F7F4EF",
  "theme_color": "#B8860B"
}
```

Si le manifest n'existe pas, le créer avec ces valeurs + les icônes référencées.

## Design System (rappel)
- Fond : var(--bg) = #F7F4EF
- Accent : var(--accent) = #B8860B
- Accent light : var(--accent-light) = #D4A843
- Accent bg : var(--accent-bg) = #FAF6ED
- Text primary : var(--text-primary) = #1A1A1A
- Text secondary : var(--text-secondary) = #6B6560
- Text muted : var(--text-muted) = #A09A93
- Border : var(--border-color) = #E8E3DA
- Card bg : var(--bg-card) = #FFFFFF
- Radius : 14px (cartes), 10px (boutons)
- Shadow sm : 0 1px 3px rgba(0,0,0,0.04)
- Shadow md : 0 4px 12px rgba(0,0,0,0.06)
- Titres : Playfair Display (serif)
- Corps : DM Sans (sans-serif)
- Pas d'emojis, SVG stroke uniquement

## Contraintes
- Ne PAS modifier les pages existantes (Home, AddBottle, RemoveBottle, etc.)
- Ne PAS modifier BottomNav, index.css, ni les composants UI
- La landing page ne doit PAS afficher la BottomNav
- Tout doit fonctionner avec le max-width 430px desktop déjà en place
- Pas de dépendances npm supplémentaires
