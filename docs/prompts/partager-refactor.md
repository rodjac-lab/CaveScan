# CaveScan — Refactor du flux "Partager" (Déguster)

## Contexte

Tu travailles sur CaveScan, une app de gestion de cave à vin. L'écran "Partager" (route `/remove`) permet de scanner un vin pour le sortir de cave ou documenter une dégustation.

Le flux actuel a 10 états dans sa state machine. L'objectif est de le simplifier à 6 états, en supprimant les frictions inutiles et en améliorant le workflow batch.

**Règle absolue : tous les changements doivent respecter le design system existant de l'app.** Pas de nouvelles couleurs, pas de composants qui détonnent. La sobriété est prioritaire.

---

## Design System — Référence rapide

### Philosophie
L'app est **premium et sobre** : palette chaude (ambre/or), polices serif pour les titres (Playfair Display), sans-serif pour le corps (DM Sans), pas de gradients flashy, espaces généreux.

### Tokens à utiliser

```css
/* Backgrounds */
--bg: #F7F4EF;
--bg-card: #FFFFFF;
--accent-bg: #FAF6ED;      /* fond accentué léger */

/* Text */
--text-primary: #1A1A1A;
--text-secondary: #6B6560;
--text-muted: #A09A93;

/* Accent */
--accent: #B8860B;          /* Dark Goldenrod — couleur principale */
--accent-light: #D4A843;

/* Border & Shadows */
--border: #E8E3DA;
--shadow-sm: 0 1px 3px rgba(0,0,0,0.04);
--shadow-md: 0 4px 12px rgba(0,0,0,0.06);

/* Radii */
--radius: 14px;             /* cartes principales */
--radius-sm: 10px;          /* items de liste, inputs */
```

### Composants existants à réutiliser
- **Wine List Item** : carte avec barre de couleur (3×32px), nom domaine (13px/500), détail (11px muted), rayon 10px, ombre `--shadow-sm`
- **Scan Zone** : carte flottante au-dessus de la nav, 14px radius, ombre `--shadow-md`, boutons circulaires 42×42px
- **Section Header** : Playfair 16px/600 à gauche, lien accent 12px à droite
- **Divider avec label** : lignes `--border` + texte uppercase 10px/500 centré

### Icônes
- Source : Lucide (stroke-only, stroke-width 2, linecap round)
- **PAS d'emojis** dans l'UI finale. Les emojis sont uniquement dans ce prompt pour la lisibilité.
- Taille nav : 22×22px, taille boutons scan : 20×20px

### Typographie clé
- Titres d'écran : Playfair Display, 30px, 700
- Sections : Playfair Display, 16px, 600
- Corps : DM Sans, 13px, 500
- Détails/méta : DM Sans, 11px, 400, `--text-muted`
- Labels uppercase : DM Sans, 10px, 500, `--text-muted`, letter-spacing 0.8px

---

## Les 6 changements à implémenter

Implémente ces changements **dans l'ordre** (chaque phase est indépendante et testable).

---

### Phase 1 — Simplifier le Quick Scan (2-3h)

#### 1.1 Fusionner les états `extracting` et `matching` en un seul état `processing`

**Avant :** La state machine passe par `extracting` → `matching` avec deux écrans de chargement distincts.

**Après :** Un seul état `processing` avec un spinner et le texte "Analyse en cours…" (DM Sans 13px/500, `--text-secondary`).

**Implémentation :**
- Dans la state machine (chercher le fichier qui gère les steps/states du flux Partager), remplacer les deux états par un seul
- L'appel API reste le même (extraction puis matching), seule la représentation UI fusionne
- Le spinner existant de l'app suffit — pas besoin d'en créer un nouveau

#### 1.2 Supprimer l'état `not_found` — le remplacer par un badge "Hors cave"

**Avant :** Quand le vin scanné n'est pas trouvé dans l'inventaire, un écran d'erreur s'affiche ("Vin non trouvé dans votre cave").

**Après :** L'écran de résultat est **toujours le même**, que le vin soit en cave ou non. La seule différence est un badge discret et le bouton d'action principal.

**Cas "En cave" (match trouvé) :**
- Badge : texte "En cave" avec un petit dot `--accent` (6×6px, `border-radius: 50%`) devant
- Style du badge : `font-size: 11px`, `font-weight: 500`, `color: var(--accent)`
- Pas de fond coloré, pas de pill — juste le dot + le texte, alignés avec les métadonnées
- Bouton principal : "Sortir de cave" (style bouton primaire existant, fond `--accent`, texte blanc)
- Localisation affichée : "Cave principale · Ét. 3" en `11px`, `--text-muted`

**Cas "Hors cave" (pas de match) :**
- Badge : texte "Hors cave" avec un petit dot `--text-muted` (6×6px, `border-radius: 50%`) devant
- Style du badge : `font-size: 11px`, `font-weight: 500`, `color: var(--text-muted)`
- Bouton principal : "Noter la dégustation" (même style bouton primaire, fond `--accent`, texte blanc)
- Pas de localisation affichée (puisque pas en cave)

**Important sur les badges :**
Le badge n'est PAS un gros pill coloré. C'est un indicateur discret, dans le même style que les métadonnées existantes (comme "Champagne · 2019"). Il utilise le pattern dot + texte déjà présent dans les Wine List Items (la barre de couleur de 3px qui indique le type de vin → ici c'est un dot de 6px qui indique le statut cave).

**Implémentation :**
- Supprimer le composant/écran `not_found` et toute la logique de branchement vers cet état
- L'écran de résultat reçoit une prop `matchType: 'in_cave' | 'not_in_cave'`
- Le bouton principal et le badge sont conditionnels sur `matchType`
- La logique de matching retourne toujours un résultat (extraction + match ou extraction seule), jamais une erreur

#### 1.3 Supprimer l'état/écran `correct` (formulaire de correction manuelle)

**Avant :** Si l'extraction IA est mauvaise, l'utilisateur est envoyé sur un formulaire pour corriger manuellement les champs.

**Après :** Plus de formulaire de correction. À la place :
- Un lien discret sous le résultat : "Ce n'est pas cette bouteille ?" (`font-size: 12px`, `color: var(--accent)`, `font-weight: 500`)
- Au tap → afficher la liste des matches alternatifs (s'il y en a) dans un bottom sheet ou une section dépliable
- S'il n'y a aucun match → "Saisir manuellement" qui redirige vers l'écran Edit existant avec les champs pré-remplis par l'extraction
- L'écran Edit existant (`/bottle/:id/edit`) sert de correction — pas besoin d'un écran dédié

**Implémentation :**
- Supprimer le composant/écran `correct` et sa logique de navigation
- Ajouter le lien "Ce n'est pas cette bouteille ?" sur l'écran résultat
- Gérer l'affichage des alternatives (liste simple, même style que Wine List Item)

#### 1.4 Afficher le meilleur match directement

**Avant :** Si plusieurs matches, une liste complète s'affiche et l'utilisateur doit choisir.

**Après :** Le meilleur match (score le plus haut) s'affiche directement comme résultat. La liste complète est accessible via "Ce n'est pas cette bouteille ?" (même lien que 1.3).

**Implémentation :**
- Trier les résultats de matching par score
- Afficher `results[0]` comme résultat principal
- Garder le reste en `results.slice(1)` pour le fallback

---

### Phase 2 — Extraction batch non bloquante (3-4h)

#### Contexte du workflow batch existant
L'utilisateur prend des photos le soir avec l'appareil natif (0 interaction CaveScan), puis le lendemain il ouvre CaveScan → Galerie → sélectionne N photos → l'extraction démarre.

**Avant :** L'extraction des N photos est séquentielle et bloquante — l'utilisateur regarde un spinner pendant 30s+.

**Après :** L'extraction se fait en background. L'utilisateur peut naviguer dans l'app.

#### 2.1 Extraction en arrière-plan

**Implémentation :**
- Après la sélection des photos dans la galerie, créer un objet de session `batchSession` :
  ```ts
  interface BatchSession {
    id: string;
    createdAt: Date;
    status: 'processing' | 'ready' | 'done';
    items: BatchItem[];
  }
  
  interface BatchItem {
    id: string;
    photoUri: string;
    extraction: WineExtraction | null;
    matchedBottleId: string | null;
    matchType: 'in_cave' | 'not_in_cave' | null;
    processedAt: Date | null;
  }
  ```
- Lancer l'extraction en background (queue séquentielle, pas de parallélisme pour ne pas surcharger l'API)
- Stocker la progression dans un state global (Zustand, Context, ou ce que l'app utilise déjà)
- L'utilisateur est redirigé vers l'écran Partager immédiatement après sélection des photos

#### 2.2 Nudge "X vins à documenter"

Quand une session batch est en cours ou prête (`status === 'processing' | 'ready'`), afficher un bandeau en haut de l'écran Partager, **entre le header et la section "Ouvertures récentes"**.

**Style du nudge :**
- Conteneur : `background: var(--accent-bg)` (#FAF6ED), `border: 1px solid rgba(184,134,11,0.12)`, `border-radius: var(--radius-sm)` (10px), `padding: 10px 12px`
- Layout : flex row, `gap: 12px`, `align-items: center`
- Icône à gauche : icône Lucide `loader` (si processing) ou `check-circle` (si ready), 20×20px, `color: var(--accent)`
- Texte principal : "3 vins en cours d'analyse…" ou "3 vins à documenter" — DM Sans 13px/500, `--text-primary`
- Texte secondaire (en dessous) : "Rafale du 06/02" — DM Sans 11px/400, `--text-muted`
- Chevron à droite : icône Lucide `chevron-right`, 16×16px, `--text-muted`
- Au tap → naviguer vers l'écran Review (Phase 3)

**Ce nudge utilise les mêmes codes visuels que le reste de l'app** : fond `--accent-bg`, bordure subtile, icône accent. Pas de couleur orange/jaune d'alerte — ce n'est pas une notification urgente, c'est une invitation douce.

---

### Phase 3 — Écran Review batch avec badges (2-3h)

Nouvel écran accessible depuis le nudge. Il liste tous les vins d'une session batch avec leurs résultats.

#### 3.1 Header

- Brand : "CAVESCAN" (Playfair 11px, uppercase, letter-spacing 3px, `--accent`)
- Titre : "Rafale du [date]" (Playfair 16px/600, `--text-primary`)
- Sous-titre : "3 vins · 2 en cave, 1 hors cave" (DM Sans 11px/400, `--text-muted`)

#### 3.2 Cartes individuelles

Chaque vin est affiché dans une carte **Wine List Item étendue** :

```
┌─────────────────────────────────────────────────┐
│  [Photo]  Domaine Name                  • En cave │
│  30×30    Appellation · Millésime                  │
│                                                    │
│  [ Sortir de cave ]              [ Ignorer ]       │
└─────────────────────────────────────────────────┘
```

**Structure :**
- Conteneur : `background: var(--bg-card)`, `border: 1px solid var(--border)`, `border-radius: var(--radius-sm)`, `padding: 10px 12px`, `margin-bottom: 6px`
- Photo miniature : 30×30px, `border-radius: 6px`, `object-fit: cover`
- Nom/appellation : même style que Wine List Item existant
- Badge "En cave" ou "Hors cave" : même style que défini en Phase 1 (dot + texte, discret)
- Zone d'actions (en bas de la carte) :
  - **En cave** → Bouton "Sortir de cave" : `background: var(--accent-bg)`, `color: var(--accent)`, `font-size: 12px`, `font-weight: 500`, `border-radius: var(--radius-sm)`, `padding: 8px 0`, `text-align: center`, `flex: 1`
  - **Hors cave** → Bouton "Noter la dégustation" : même style
  - Bouton "Ignorer" : `color: var(--text-muted)`, `font-size: 12px`, `font-weight: 500`, pas de fond, juste du texte

#### 3.3 Bouton "Tout valider"

En bas de l'écran (sticky ou en fin de liste) :

- Style : bouton primaire existant (fond `--accent`, texte blanc, 14px radius, padding 14px)
- Texte : "Tout valider" (DM Sans 14px/600)
- Comportement : exécute l'action par défaut pour chaque vin non ignoré (sortir de cave pour les "en cave", créer fiche dégustation pour les "hors cave")
- Après validation → marquer la session comme `done`, retourner à l'écran Partager

#### 3.4 Item non résolu

Si un vin n'a pas pu être extrait (photo floue, pas d'étiquette visible) :
- Badge : "Non identifié" — même pattern (dot `--text-muted` + texte muted)
- Action unique : "Saisir manuellement" → ouvre l'écran Edit vide

---

### Phase 4 — Polish et cohérence (1-2h)

#### 4.1 Animation du spinner "processing"

Utiliser les transitions existantes (200ms ease). Le spinner peut être l'icône Lucide `loader-2` en rotation CSS (`animation: spin 1s linear infinite`).

#### 4.2 Transition vers le résultat

Quand le processing se termine, le résultat apparaît avec un fade-in simple (200ms ease-out). Pas de transition complexe.

#### 4.3 Cohérence des textes

Vérifier que tous les textes utilisent les bonnes tailles et poids définis dans le design system. Aucun texte ne devrait être en dehors de l'échelle typographique documentée.

#### 4.4 Nettoyage du code mort

- Supprimer les composants orphelins (`NotFoundScreen`, `CorrectScreen`, ou équivalent)
- Supprimer les états obsolètes de la state machine (`not_found`, `correct`, `extracting` séparé, `matching` séparé)
- Mettre à jour les types TypeScript si applicable

---

## Récapitulatif de la state machine

### AVANT (10 états)
```
choose → extracting → matching → select → confirm → saving
                                       ↘ not_found
                                       ↘ correct
         batch-extracting → batch-ready → saving
```

### APRÈS (6 états)
```
choose → processing → result → saving
         batch-processing (background) → review → saving
```

### Mapping des suppressions
| Ancien état | Devenu |
|-------------|--------|
| `extracting` | Fusionné dans `processing` |
| `matching` | Fusionné dans `processing` |
| `not_found` | **Supprimé** — résultat avec badge "Hors cave" |
| `correct` | **Supprimé** — lien "Ce n'est pas cette bouteille ?" + écran Edit existant |
| `select` | Intégré dans `result` (meilleur match affiché, alternatives en fallback) |
| `batch-extracting` | Renommé `batch-processing` (non bloquant) |
| `batch-ready` | Renommé `review` (avec cartes individuelles) |

---

## Contraintes et garde-fous

1. **Ne pas introduire de nouvelles couleurs.** Tout doit utiliser les tokens du design system (`--accent`, `--accent-bg`, `--text-muted`, `--border`, etc.). Les badges utilisent `--accent` (en cave) et `--text-muted` (hors cave) — pas de vert, pas de bleu, pas d'orange.

2. **Ne pas ajouter de dépendances.** Utiliser les librairies et composants déjà en place dans le projet.

3. **Ne pas modifier les autres écrans.** Cave, Encaver, Réglages, Fiche Bouteille, Edit — rien ne change. Seul le flux Partager est concerné.

4. **Tester chaque phase indépendamment.** Chaque phase doit laisser l'app dans un état fonctionnel.

5. **Les badges sont des indicateurs discrets, pas des alertes.** Pattern = dot 6×6px + texte 11px. Pas de pill colorée, pas de fond contrasté, pas de bordure visible. C'est une métadonnée, pas un call-to-action.

6. **Le workflow batch existant (photos natives → galerie → multi-select) ne change pas.** On améliore uniquement ce qui se passe APRÈS la sélection des photos.
