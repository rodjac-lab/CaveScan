# CaveScan — BottlePage : Ajout du mode Cave (in_stock)

## Contexte

Tu interviens sur **CaveScan**, une app mobile React Native de gestion de cave à vin. L'écran **BottlePage** (fiche détail d'une bouteille) a déjà été refondu avec le design "Fiche Éditoriale" et **fonctionne correctement pour le menu Partager** (bouteilles bues, `bottle.status === 'drunk'`).

### ⚠️ Ce qui est DÉJÀ fait et NE DOIT PAS être touché :
- Le mode Partager (status `drunk`) : identity card + section Dégustation (textarea, photos, boutons Enregistrer/Share)
- Le header, l'identity card, la nav bar, les animations existantes
- Tout le reste de l'app (Cave liste, Encaver, Partager liste, Réglages)

### Ce qui reste à faire :
**Ajouter le mode Cave** : quand `bottle.status === 'in_stock'`, l'écran doit afficher une variante différente sous l'identity card — avec les infos de cave et l'historique des dégustations passées, à la place de la section Dégustation.

---

## Design existant — Mode Partager (RÉFÉRENCE UNIQUEMENT, ne pas modifier)

### Philosophie
Layout éditorial inspiré des fiches magazine/Vivino : photo en vignette compacte à gauche, informations du vin à droite, puis la note de dégustation immédiatement visible — le tout sur un seul écran, sans scroll obligatoire.

### Structure de l'écran (top → bottom)

```
┌─────────────────────────────────────────┐
│  [←]                    [color bar] [✎] │  ← Page header
├─────────────────────────────────────────┤
│  ┌──────┐  Domaine Paul Pillot         │
│  │      │  Bourgogne                    │  ← Identity card
│  │ PHOTO│  [2022] [Blanc]              │     (bg-card, radius, shadow-md)
│  │90×120│                               │
│  └──────┘                               │
│  📅 7 fév. 2026 │ 💰 — │ 📍 Cave      │  ← Detail row (border-top)
├─────────────────────────────────────────┤
│  ──── Dégustation ────                  │  ← Section divider
│                                         │
│  [+ photo]                              │  ← Tasting photos
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ Note de dégustation...          │    │  ← Tasting card
│  │                                 │    │     (bg-card, border, shadow-sm)
│  │                                 │    │
│  ├─────────────────────────────────┤    │
│  │ [Enregistrer]          [Share]  │    │  ← Action bar (border-top)
│  └─────────────────────────────────┘    │
│                                         │
│            (bottom spacer 90px)         │
├─────────────────────────────────────────┤
│  Cave  │ Encaver │ Partager │ Réglages  │  ← Nav bar (fixe, blur)
└─────────────────────────────────────────┘
```

### Spécifications CSS détaillées

#### Page Header
```
padding: 14px 16px 0
display: flex, align-items: center, gap: 8px
```
- Bouton back : 36×36px, border-radius: 50%, bg: transparent, hover: accent-bg
- Spacer : flex: 1
- Wine color bar : 3×24px, border-radius: 2px, couleur dynamique selon le type de vin
- Bouton edit : 36×36px, même style que back, couleur: text-muted

#### Identity Card
```
margin: 12px 16px 0
background: var(--bg-card)
border-radius: var(--radius)        /* 14px */
box-shadow: var(--shadow-md)
overflow: hidden
```

**Zone haute (identity-top)** :
```
display: flex, gap: 14px, padding: 14px
```
- Photo thumbnail : `width: 90px, height: 120px, border-radius: 8px, object-fit: cover, cursor: pointer`
  - hover: `transform: scale(1.02)`, transition: 0.15s
  - background placeholder: #e8e3da
- Info zone (flex: 1, min-width: 0) :
  - Domaine : Playfair Display, 20px, weight 700, line-height 1.15, color: text-primary
  - Appellation : DM Sans, 13px, weight 400, color: text-secondary, margin-top: 1px
  - Tags container : flex, flex-wrap, gap: 6px, margin-top: 8px
    - Tag millésime : Playfair Display, 12px, weight 600, color: text-primary, bg: accent-bg, border: 1px solid rgba(184,134,11,0.06), padding: 3px 10px, border-radius: 20px
    - Tag couleur : DM Sans, 11px, weight 500, color: text-secondary, même style

**Zone basse (identity-details)** :
```
display: flex, border-top: 1px solid var(--border-color)
```
- 3 cellules flex: 1, chacune avec :
  - padding: 10px 8px, border-right: 1px solid border-color (sauf last-child)
  - display: flex, align-items: center, justify-content: center, gap: 6px
  - Icône : 14×14px, color: text-muted
  - Texte : DM Sans, 11px, weight 500, color: text-secondary
- Cellules : Date de dégustation | Prix | Lieu/Cave

#### Section Dégustation

**Divider** :
```
display: flex, align-items: center, gap: 10px, margin-bottom: 10px
```
- Lignes : flex: 1, height: 1px, background: border-color
- Label : 9px, uppercase, letter-spacing: 2px, color: text-muted, weight 500

**Photos de dégustation** :
```
display: flex, gap: 8px, margin-bottom: 10px
```
- Bouton ajouter : 52×52px, border-radius: 8px, border: 1.5px dashed border-color
  - hover: border-color: accent, color: accent

**Carte note de dégustation** :
```
background: var(--bg-card)
border-radius: var(--radius)
border: 1px solid var(--border-color)
box-shadow: var(--shadow-sm)
overflow: hidden
```
- Textarea : width 100%, min-height: 162px, padding: 14px 16px, DM Sans 14px, line-height 1.6, no border/outline, resize: none
  - placeholder: text-muted, italic
  - focus-within sur le wrapper: border-color: accent (optionnel)
- Action bar : flex, gap: 8px, padding: 10px 14px, border-top: 1px solid border-color
  - Bouton primaire "Enregistrer" : flex: 1, height: 44px, bg: red-wine (#722F37), color: white, DM Sans 14px weight 600, border-radius: radius-sm, active: scale(0.97)
  - Bouton share : 44×44px, border: 1px solid border-color, bg: bg-card, hover: border accent + color accent

#### Animations
```css
@keyframes slideUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
.identity-card { animation: slideUp 0.25s ease-out; }
.tasting-section { animation: slideUp 0.3s ease-out 0.05s both; }
```

---

## Mode Cave (bottle.status === 'in_stock')

### ⚠️ L'écran BottlePage a DEUX variantes selon le statut de la bouteille.

Quand la bouteille est en cave (`in_stock`), la section "Dégustation" est remplacée par **deux sections** qui remplissent naturellement l'écran :

### Structure de l'écran en mode Cave (top → bottom)

```
┌─────────────────────────────────────────┐
│  [←]                    [color bar] [✎] │  ← Page header (identique)
├─────────────────────────────────────────┤
│  ┌──────┐  Domaine Paul Pillot         │
│  │ PHOTO│  Bourgogne                    │  ← Identity card (identique)
│  │90×120│  [2022] [Blanc]              │
│  └──────┘                               │
│  📅 12 jan. 2026 │ 💰 28€ │ 📍 Cave   │
├─────────────────────────────────────────┤
│  ──── Ma cave ────                      │  ← Section divider
│  ┌─────────────────────────────────┐    │
│  │ 🏷  Quantité              3 btl│    │  ← Cave info card
│  │ 🔲  Emplacement   Rangée 2, c.5│    │     (liste key-value)
│  │ 📅  Entrée en cave  12 jan 2026│    │
│  │ 💰  Prix d'achat          28 € │    │
│  └─────────────────────────────────┘    │
├─────────────────────────────────────────┤
│  ──── Dégustations passées ────         │  ← Section divider
│  ┌─────────────────────────────────┐    │
│  │ 18   │ Superbe bouteille, très  │    │  ← History item (tappable)
│  │ Nov  │ minérale avec des notes… │    │     → ouvre la fiche dégustation
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ 03   │ Bue un peu trop fraîche. │    │  ← History item
│  │ Sep  │ Pas mal mais manquait…   │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │     🔔 Ouvrir cette bouteille   │    │  ← CTA pleine largeur
│  └─────────────────────────────────┘    │     → bascule vers flux Partager
│                                         │
│            (bottom spacer 90px)         │
├─────────────────────────────────────────┤
│  Cave  │ Encaver │ Partager │ Réglages  │  ← Nav bar (Cave = active)
└─────────────────────────────────────────┘
```

### Spécifications CSS — Section "Ma cave"

**Cave info card** :
```
background: var(--bg-card)
border-radius: var(--radius)
border: 1px solid var(--border-color)
box-shadow: var(--shadow-sm)
overflow: hidden
```

**Rangées key-value** :
```
display: flex, align-items: center, padding: 12px 16px
border-bottom: 1px solid var(--border-color) (sauf last-child)
```
- Icône : 16×16px, color: text-muted, margin-right: 12px, SVG stroke
- Label : DM Sans, 12px, weight 400, color: text-muted, flex: 1
- Valeur : DM Sans, 13px, weight 500, color: text-primary, text-align: right
- Valeur quantité (mise en avant) : Playfair Display, 17px, weight 700, color: text-primary, avec unité "btl" en DM Sans 11px weight 400 color text-muted

**Rangées** : Quantité | Emplacement | Entrée en cave | Prix d'achat

### Spécifications CSS — Section "Dégustations passées"

**History item** (tappable → ouvre la fiche dégustation correspondante) :
```
display: flex, gap: 12px
background: var(--bg-card)
padding: 12px 14px
border-radius: var(--radius-sm)
box-shadow: var(--shadow-sm)
margin-bottom: 6px
cursor: pointer
transition: all 0.2s
hover: box-shadow: shadow-md
```

- Date bloc (flex-shrink: 0, width: 36px, text-align: center) :
  - Jour : Playfair Display, 17px, weight 700, line-height 1, color: text-primary
  - Mois : DM Sans, 9px, uppercase, letter-spacing: 0.5px, color: text-muted, weight 500, margin-top: 2px
- Color bar : 3×32px, border-radius: 2px, couleur selon type de vin, align-self: center
- Content (flex: 1, min-width: 0) :
  - Note : DM Sans, 13px, weight 400, color: text-secondary, line-height 1.4, **line-clamp: 2** (truncate à 2 lignes)
  - Context : DM Sans, 10px, color: text-muted, margin-top: 4px (icône 10px + label "Partagée via WhatsApp" ou "Enregistrée")

**Empty state** (aucune dégustation passée) :
```
text-align: center, padding: 20px 16px
color: text-muted, font-size: 13px, font-style: italic
```
Texte : "Aucune dégustation enregistrée pour ce vin."

### Spécifications CSS — CTA "Ouvrir cette bouteille"

```
margin: 16px 16px 0
width: calc(100% - 32px)
height: 48px
border-radius: var(--radius-sm)
background: var(--red-wine)
color: white
font-family: DM Sans, 15px, weight 600
display: flex, align-items: center, justify-content: center, gap: 10px
active: scale(0.97)
```
- Icône : SVG cloche/bell (Lucide), 18×18px, stroke white
- Action : bascule la bouteille vers le flux "Partager" (status → drunk, ouvre la section dégustation)

### Animations mode Cave
```css
.identity-card { animation: slideUp 0.25s ease-out; }
.cave-section { animation: slideUp 0.3s ease-out 0.05s both; }
.history-section { animation: slideUp 0.35s ease-out 0.1s both; }
.cta-section { animation: slideUp 0.4s ease-out 0.15s both; }
```

### Logique de routage (à ajouter dans BottlePage)

```
if (bottle.status === 'in_stock') {
  → Afficher : Identity card + "Ma cave" + "Dégustations passées" + CTA   ← NOUVEAU
  → identity-details : Date = date d'entrée, Prix = prix d'achat
  → Nav bar : "Cave" actif
}

if (bottle.status === 'drunk') {
  → Afficher : Identity card + Section "Dégustation"                       ← EXISTANT, ne pas toucher
  → identity-details : Date = date de dégustation, Prix = "—" ou prix d'achat
  → Nav bar : "Partager" actif
}
```

---

## Design System — Règles OBLIGATOIRES

### ⚠️ Ces règles ne sont pas optionnelles. Chaque déviation est un bug.

**Couleurs — utilise EXACTEMENT ces tokens :**
| Token | Hex | Usage |
|-------|-----|-------|
| `--bg` | `#F7F4EF` | Fond principal |
| `--bg-card` | `#FFFFFF` | Cartes, éléments surélevés |
| `--accent-bg` | `#FAF6ED` | Fond éléments accentués |
| `--text-primary` | `#1A1A1A` | Titres |
| `--text-secondary` | `#6B6560` | Sous-titres |
| `--text-muted` | `#A09A93` | Labels, métadonnées |
| `--accent` | `#B8860B` | Accent principal (Dark Goldenrod) |
| `--border` / `--border-color` | `#E8E3DA` | Séparateurs |
| `--red-wine` | `#722F37` | Rouge / bouton primaire |
| `--white-wine` | `#C8B560` | Blanc |
| `--rose-wine` | `#D4917A` | Rosé |
| `--champagne` | `#DAC17C` | Champagne |

**Typographie :**
- **Playfair Display** (serif) → Titres, domaine, millésime, nombres importants
- **DM Sans** (sans-serif) → Corps, labels, UI, boutons
- Labels uppercase : 10px, letter-spacing 0.8px (ou 2px pour dividers), weight 500, color text-muted

**Espacements :**
- Padding horizontal écran : 16px (pour cette page, le design system dit 24px pour les écrans principaux mais la fiche utilise 16px avec les cards en marge)
- Radius cartes : 14px (`--radius`)
- Radius boutons/inputs : 10px (`--radius-sm`)
- Ombres : `--shadow-sm` pour les cartes, `--shadow-md` pour les éléments flottants

**Icônes :**
- Stroke/outline uniquement, JAMAIS de fill
- stroke-width: 2, linecap: round, linejoin: round
- Source : Lucide / Feather
- ⚠️ **JAMAIS d'emojis** — uniquement des SVG stroke

**Nav bar :**
- Position fixe en bas, backdrop-filter: blur(20px), bg: rgba(255,255,255,0.92)
- 4 onglets : Cave, Encaver, Partager (smiley malicieux), Réglages
- Actif : opacity 1, couleur accent | Inactif : opacity 0.4
- Padding : 8px 24px 22px (safe area iOS)

---

## Intégration dans le flux de l'app

### Points d'attention critiques

1. **Navigation entrante** : Cet écran est accessible depuis :
   - La liste de la Cave (tap sur un wine-list-item)
   - La liste "Partager" / historique de dégustation
   - Après un scan (flux Encaver → résultat → fiche)
   
   → Le bouton "back" (←) doit déclencher `navigation.goBack()` et fonctionner correctement quel que soit l'écran d'origine.

2. **Navigation sortante** :
   - Bouton "Edit" (✎) → ouvre l'écran d'édition de la bouteille (formulaire)
   - Bouton "Enregistrer" → sauvegarde la note de dégustation (mode Partager uniquement)
   - Bouton "Share" → déclenche le partage WhatsApp (mode Partager uniquement)
   - Tap sur la photo → ouvre en plein écran ou lightbox
   - Tap sur un history item → ouvre la fiche dégustation correspondante (mode Cave uniquement)
   - CTA "Ouvrir cette bouteille" → change le status de la bouteille et bascule vers le mode Partager (mode Cave uniquement)
   
   → Vérifie que chaque action est correctement câblée et ne casse pas le navigation stack.

3. **Données dynamiques** : L'écran reçoit les données de la bouteille en paramètre (route params ou context). Assure-toi que :
   - Le nom du domaine, la cuvée, l'appellation, le millésime, la couleur sont dynamiques
   - La wine-color-bar dans le header utilise la bonne couleur selon `bottle.color` (rouge/blanc/rosé/champagne)
   - La date affichée est la date de dégustation (si bouteille bue) ou la date d'entrée en cave
   - La note de dégustation est éditable et se sauvegarde (mode Partager)
   - La photo est celle de la bouteille (avec fallback sur un placeholder #e8e3da)
   - Les infos cave (quantité, emplacement) sont dynamiques (mode Cave)
   - L'historique des dégustations passées est chargé depuis les données du vin (mode Cave)

4. **État de la bouteille** : L'écran a **deux modes mutuellement exclusifs** selon `bottle.status` :
   - `in_stock` → **Mode Cave (À IMPLÉMENTER)** : identity card + section "Ma cave" + historique dégustations + CTA "Ouvrir"
   - `drunk` → **Mode Partager (DÉJÀ EN PLACE)** : identity card + section "Dégustation" (textarea + photos + action bar)

---

## Plan de test — Non-régression

### ⚠️ Tu dois vérifier CHAQUE point avant de considérer la tâche comme terminée.

### 1. Tests de build
```bash
# L'app doit compiler sans erreur
npx react-native start --reset-cache
# Ou selon le setup du projet :
npx expo start
```
- [ ] Zéro erreur TypeScript
- [ ] Zéro warning bloquant
- [ ] L'app se lance sur simulateur iOS et/ou Android

### 2. Tests de navigation (avant cet écran)
- [ ] L'écran **Cave** (liste des bouteilles) fonctionne normalement
- [ ] L'écran **Encaver** (scan / ajout) fonctionne normalement
- [ ] L'écran **Partager** (historique dégustations) fonctionne normalement
- [ ] L'écran **Réglages** fonctionne normalement
- [ ] Le tap sur un wine-list-item ouvre bien la nouvelle BottlePage
- [ ] La transition d'entrée est fluide (animation slideUp)

### 3. Tests de l'écran BottlePage — Partie commune
- [ ] Le layout correspond exactement à la maquette (photo 90×120 à gauche, infos à droite)
- [ ] Les polices sont correctes (Playfair Display pour le domaine/millésime, DM Sans pour le reste)
- [ ] Les couleurs respectent le design system (vérifier les tokens un par un)
- [ ] La wine-color-bar affiche la bonne couleur selon le type de vin
- [ ] Les tags (millésime, couleur) sont affichés en pills
- [ ] La barre de détails (date, prix, lieu) affiche les bonnes données
- [ ] Le bouton "back" ramène à l'écran précédent
- [ ] Le bouton "edit" ouvre le formulaire d'édition
- [ ] La photo est cliquable (zoom/lightbox)
- [ ] Le bottom spacer (90px) empêche le contenu d'être masqué par la nav bar

### 3b. Tests mode Partager — RÉGRESSION UNIQUEMENT (ne pas modifier, vérifier que rien n'est cassé)
- [ ] Le divider "Dégustation" utilise toujours le bon pattern (lignes + label centré)
- [ ] La note de dégustation est toujours visible sans scroll sur un iPhone standard (375px)
- [ ] Le textarea est toujours éditable, le clavier s'ouvre correctement
- [ ] Le bouton "Enregistrer" sauvegarde toujours la note
- [ ] Le bouton "Share" déclenche toujours le partage WhatsApp
- [ ] La nav bar montre "Partager" comme onglet actif

### 3c. Tests mode Cave — NOUVEAU (c'est ce qu'on implémente)
- [ ] La section "Ma cave" s'affiche à la place de "Dégustation"
- [ ] La cave info card affiche 4 rangées : Quantité, Emplacement, Entrée en cave, Prix d'achat
- [ ] La quantité utilise Playfair Display 17px bold avec unité "btl" en DM Sans
- [ ] La section "Dégustations passées" s'affiche en dessous
- [ ] Les history items affichent la date (jour + mois), la color bar, la note tronquée à 2 lignes
- [ ] Les history items sont tappables → ouvrent la fiche dégustation correspondante
- [ ] Le contexte ("Partagée via WhatsApp" / "Enregistrée") s'affiche sous la note
- [ ] L'empty state s'affiche correctement s'il n'y a aucune dégustation passée
- [ ] Le CTA "Ouvrir cette bouteille" s'affiche pleine largeur en bas
- [ ] Le CTA bascule la bouteille vers le flux Partager
- [ ] La nav bar montre "Cave" comme onglet actif
- [ ] L'identity-details affiche la date d'entrée en cave (pas la date de dégustation)

### 4. Tests de navigation (après cet écran)
- [ ] Depuis BottlePage, retour arrière → l'écran d'origine est intact
- [ ] Depuis BottlePage, edit → formulaire → retour → BottlePage affiche les données mises à jour
- [ ] Depuis BottlePage (mode Partager), partage WhatsApp → retour → BottlePage est toujours dans le bon état
- [ ] Depuis BottlePage (mode Cave), tap history item → fiche dégustation → retour → BottlePage intact
- [ ] Depuis BottlePage (mode Cave), CTA "Ouvrir" → bascule vers mode Partager → les sections changent correctement
- [ ] Aucun écran de l'app n'est cassé après la refonte

### 5. Tests edge cases
- [ ] Bouteille sans photo → le placeholder #e8e3da s'affiche
- [ ] Bouteille sans note de dégustation → le placeholder italic s'affiche dans le textarea (mode Partager)
- [ ] Bouteille sans prix → afficher "—"
- [ ] Nom de domaine très long → ellipsis ou wrap propre (pas de débordement)
- [ ] Appellation très longue → idem
- [ ] Note de dégustation très longue → le textarea grandit, le scroll fonctionne
- [ ] Bouteille in_stock sans emplacement → afficher "—"
- [ ] Bouteille in_stock avec quantité = 0 → gérer proprement (ne devrait plus être in_stock)
- [ ] Bouteille in_stock avec 10+ dégustations passées → la liste scrolle, pas de problème de performance
- [ ] Orientation paysage → layout ne casse pas (si supporté)

### 6. Tests de performance
- [ ] Pas de re-render inutile quand on tape dans le textarea
- [ ] L'animation d'entrée est fluide (60fps)
- [ ] Pas de flash blanc au chargement de la photo

---

## Résumé des fichiers impactés

Le scope exact dépend de l'architecture existante, mais au minimum :
- `BottlePage.tsx` (ou équivalent) — **ajout du branchement conditionnel `in_stock` / `drunk`** et des composants du mode Cave
- Styles associés — **ajout des styles pour les nouvelles sections** (cave info card, history items, CTA)
- Navigation config — **vérifier que les routes restent intactes**

**Ne touche PAS** aux éléments suivants :
- Le mode Partager (status `drunk`) existant — **il fonctionne, on n'y touche pas**
- Le header, l'identity card — **réutilise-les tels quels**
- Les autres écrans (Cave, Encaver, Partager, Réglages)
- Les composants partagés (NavBar, WineListItem, etc.) — sauf si un ajustement mineur est requis
- La logique métier (sauvegarde, API, state management)

---

## Référence visuelle

Deux maquettes HTML/CSS pixel-perfect sont fournies :

- **`proposal-b.html`** — Mode Partager (bottle.status === 'drunk') : **DÉJÀ IMPLÉMENTÉ, ne pas modifier.** Fourni uniquement comme référence pour la cohérence visuelle.
- **`proposal-b-cave.html`** — Mode Cave (bottle.status === 'in_stock') : **C'EST CETTE MAQUETTE QU'IL FAUT IMPLÉMENTER.**

En cas de doute entre ce prompt et les maquettes HTML, **les maquettes HTML font foi**.
