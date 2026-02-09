# CaveScan Design System

**Version:** 1.0  
**Basé sur:** Mockup v3 (validé)  
**Date:** Février 2025

---

## 1. Philosophie du Design

### Vision
CaveScan adopte une esthétique **premium et intemporelle**, inspirée des codes du vin et du luxe discret. L'interface privilégie l'élégance sur l'exubérance, avec une approche minimaliste qui met en valeur le contenu (les vins) plutôt que l'UI elle-même.

### Principes directeurs
- **Sobriété élégante** : pas de gradients flashy, animations sobres, espaces généreux
- **Lisibilité avant tout** : typographie claire, hiérarchie visuelle évidente
- **Touche artisanale** : polices serif pour les titres évoquant l'univers du vin
- **Lumière naturelle** : palette chaude rappelant une cave éclairée à la bougie

---

## 2. Palette de Couleurs

### Couleurs de base

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg` | `#F7F4EF` | Fond principal de l'app |
| `--bg-card` | `#FFFFFF` | Cartes, éléments surélevés |
| `--border` | `#E8E3DA` | Séparateurs, bordures subtiles |
| `--accent-bg` | `#FAF6ED` | Fond des éléments accentués (hover, sélection légère) |

### Couleurs de texte

| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#1A1A1A` | Titres, texte principal |
| `--text-secondary` | `#6B6560` | Sous-titres, texte secondaire |
| `--text-muted` | `#A09A93` | Labels, métadonnées, placeholders |

### Couleur d'accent (Or/Ambre)

| Token | Hex | Usage |
|-------|-----|-------|
| `--accent` | `#B8860B` | Accent principal (Dark Goldenrod) |
| `--accent-light` | `#D4A843` | Variante claire pour gradients |

L'accent doré évoque le vin blanc vieilli, l'étiquette premium, et les reflets ambrés d'un vieux millésime.

### Couleurs des types de vin

| Token | Hex | Vin |
|-------|-----|-----|
| `--red-wine` | `#722F37` | Vin rouge |
| `--white-wine` | `#C8B560` | Vin blanc |
| `--rose-wine` | `#D4917A` | Vin rosé |
| `--champagne` | `#DAC17C` | Champagne / Bulles |

Ces couleurs sont utilisées pour les indicateurs visuels (barres, dots) permettant d'identifier rapidement le type de vin.

### Ombres

| Token | Valeur | Usage |
|-------|--------|-------|
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.04)` | Cartes de liste, éléments légers |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.06)` | Éléments flottants (scan zone, modals) |

---

## 3. Typographie

### Polices

| Police | Famille | Usage |
|--------|---------|-------|
| **Playfair Display** | Serif | Titres, nombres importants, brand |
| **DM Sans** | Sans-serif | Corps de texte, labels, UI |

### Import Google Fonts
```css
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap');
```

### Échelle typographique

#### Titres (Playfair Display)

| Élément | Taille | Poids | Line-height |
|---------|--------|-------|-------------|
| H1 - Titre écran | 30px | 700 | 1.1 |
| H2 - Section title | 16px | 600 | 1.3 |
| Stat number | 24px | 700 | 1.0 |
| Date (jour) | 17px | 700 | 1.0 |
| Quantité | 15px | 600 | 1.2 |

#### Corps de texte (DM Sans)

| Élément | Taille | Poids | Couleur |
|---------|--------|-------|---------|
| Body principal | 13px | 500 | `--text-primary` |
| Sous-titre / Description | 13px | 300 | `--text-secondary` |
| Détail / Métadonnée | 11px | 400 | `--text-muted` |
| Label uppercase | 10px | 500 | `--text-muted` |
| Brand header | 11px | 400 | `--accent` |
| Lien accent | 12px | 500 | `--accent` |
| Nav item label | 10px | 500 | `--text-primary` ou `--accent` si actif |

### Styles spéciaux

**Brand mark (header)**
```css
font-family: 'Playfair Display', serif;
font-size: 11px;
letter-spacing: 3px;
text-transform: uppercase;
color: var(--accent);
```

**Labels uppercase**
```css
font-size: 10px;
text-transform: uppercase;
letter-spacing: 0.8px; /* ou 2px pour les dividers */
color: var(--text-muted);
font-weight: 500;
```

---

## 4. Espacements et Rayons

### Espacements

| Usage | Valeur |
|-------|--------|
| Padding horizontal écran | 24px |
| Gap entre items de liste | 6px |
| Padding interne carte | 10px 12px |
| Gap interne carte | 12px |
| Marge section header | 8px bottom |

### Rayons de bordure

| Token | Valeur | Usage |
|-------|--------|-------|
| `--radius` | 14px | Cartes principales, modals, zones scan |
| `--radius-sm` | 10px | Items de liste, inputs, boutons |

---

## 5. Composants

### 5.1 Navigation Bar

Position fixe en bas, avec fond semi-transparent et blur.

```css
.nav-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 10px 24px 28px; /* 28px pour safe area iPhone */
  border-top: 1px solid var(--border);
}
```

**Nav Item**
- État inactif : `opacity: 0.4`
- État actif : `opacity: 1`, icône et texte en `--accent`
- Icône : 22×22px, stroke-width: 2
- Label : 10px, font-weight 500

**Structure : 4 onglets**
1. Cave (🏠)
2. Entrée (➕)
3. Déguster (😊)
4. Réglages (⚙️)

### 5.2 Header d'écran

Structure commune à tous les écrans principaux :

```html
<div class="screen-header">
  <div class="brand">CaveScan</div>
  <h1>Titre de l'écran</h1>
  <div class="subtitle">Description contextuelle</div>
</div>
```

Padding : `6px 24px 10-14px`

### 5.3 Stats Row (écran Cave)

Ligne de statistiques cliquables avec séparateurs.

```css
.stats-row {
  display: flex;
  gap: 0;
  padding: 0 24px;
  margin-bottom: 14px;
}

.stat-item {
  flex: 1;
  text-align: center;
  padding: 10px 0;
  border-right: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.2s;
}

.stat-item:hover {
  background: rgba(184,134,11,0.04);
}
```

Contenu : dot couleur (6×6px) + nombre (Playfair 24px) + label uppercase (10px)

### 5.4 Search Bar

```css
.search-bar input {
  width: 100%;
  padding: 10px 16px 10px 38px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-card);
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
}

.search-bar input:focus {
  border-color: var(--accent);
}
```

Icône loupe positionnée en absolute à gauche (16×16px, couleur `--text-muted`).

### 5.5 Section Header

```css
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  margin-bottom: 8px;
}
```

- Titre : Playfair 16px, 600
- Lien : 12px, `--accent`, avec flèche →

### 5.6 Wine List Item

Composant central pour les listes de vins.

```
┌─────────────────────────────────────────────────┐
│  [Date]  │  [Info]                    [Qty/Ctx] │
│  02      │  Nom du domaine               3 btl  │
│  Fév     │  Appellation · Millésime             │
└─────────────────────────────────────────────────┘
```

Structure :
- **Date** : bloc 36px wide, jour en Playfair 17px bold, mois en 9px uppercase
- **Color bar** : 3×32px, indique le type de vin
- **Info** : flex: 1, nom en 13px/500, détail en 11px muted
- **Quantité** (écran Cave) : Playfair 15px/600 + "btl" en DM Sans 10px
- **Contexte** (écran Déguster) : source en 10px

```css
.wine-list-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-card);
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
}

.wine-color-bar {
  width: 3px;
  height: 32px;
  border-radius: 2px;
}

.wine-color-bar.rouge { background: var(--red-wine); }
.wine-color-bar.blanc { background: var(--white-wine); }
.wine-color-bar.rose { background: var(--rose-wine); }
.wine-color-bar.champagne { background: var(--champagne); }
```

### 5.7 Divider avec Label

Séparateur horizontal avec texte centré.

```css
.divider-label {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 24px;
  margin-bottom: 8px;
}

.divider-label::before,
.divider-label::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}

.divider-label span {
  font-size: 10px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--text-muted);
  font-weight: 500;
}
```

### 5.8 Scan Zone (écran Déguster)

Carte flottante au-dessus de la nav bar.

```css
.scan-zone {
  position: absolute;
  bottom: 80px; /* gap visible avec nav */
  left: 16px;
  right: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: var(--shadow-md);
}
```

**Structure symétrique :**
```
┌─────────────────────────────────────────┐
│  [Galerie]    Scanner un vin    [Caméra]│
│                Photo ou galerie          │
└─────────────────────────────────────────┘
```

**Boutons circulaires (42×42px)**

Bouton Galerie (secondaire) :
```css
background: var(--accent-bg);
border: 1px solid rgba(184,134,11,0.12);
/* icône en --accent */
```

Bouton Caméra (primaire) :
```css
background: linear-gradient(135deg, var(--accent) 0%, var(--accent-light) 100%);
box-shadow: 0 3px 12px rgba(184,134,11,0.25);
/* icône en blanc */
```

---

## 6. Iconographie

### Style global
- **Type** : Stroke/outline uniquement (jamais de fill)
- **Stroke width** : 2px
- **Stroke linecap** : round
- **Stroke linejoin** : round
- **Couleur** : `currentColor` (hérite du parent)

### Tailles standards
| Contexte | Taille |
|----------|--------|
| Navigation bar | 22×22px |
| Boutons scan | 20×20px |
| Search input | 16×16px |

---

### Icônes de la Navigation Bar

#### Cave (Home)
Maison simple avec toit en pointe et base rectangulaire.
```svg
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
</svg>
```

#### Entrée (Add/Plus)
Carré arrondi avec croix centrée.
```svg
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <rect x="3" y="3" width="18" height="18" rx="2"/>
  <path d="M12 5v14M5 12h14"/>
</svg>
```

#### Déguster (Smiley malicieux) ⭐
**Icône signature de l'app** — Visage souriant avec des yeux en tirets horizontaux, donnant une expression malicieuse/complice, comme quelqu'un qui savoure un bon vin.

```svg
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <!-- Cercle du visage -->
  <circle cx="12" cy="12" r="10"/>
  <!-- Sourire (arc courbé vers le haut) -->
  <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
  <!-- Œil gauche — tiret horizontal (expression malicieuse) -->
  <line x1="9" y1="9" x2="9.01" y2="9"/>
  <!-- Œil droit — tiret horizontal -->
  <line x1="15" y1="9" x2="15.01" y2="9"/>
</svg>
```

**Note importante** : Les yeux sont des tirets courts (line de 0.01 de long) qui, avec stroke-width: 2 et linecap: round, créent des petits points/tirets. Cette subtilité donne l'expression "yeux plissés" caractéristique d'une dégustation appréciée.

#### Réglages (Settings)
Engrenage classique avec cercle central.
```svg
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <circle cx="12" cy="12" r="3"/>
  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
</svg>
```

---

### Icônes de la Scan Zone

#### Galerie (Image picker)
Rectangle avec petite montagne et soleil suggérés.
```svg
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <rect x="3" y="3" width="18" height="18" rx="2"/>
  <circle cx="8.5" cy="8.5" r="1.5"/>
  <path d="M21 15l-5-5L5 21"/>
</svg>
```

#### Caméra (Camera)
Appareil photo avec objectif central.
```svg
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
  <circle cx="12" cy="13" r="4"/>
</svg>
```

---

### Icône Search

#### Loupe
```svg
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <circle cx="11" cy="11" r="8"/>
  <path d="M21 21l-4.35-4.35"/>
</svg>
```

---

### Source des icônes
Les icônes sont basées sur [Feather Icons](https://feathericons.com/) / [Lucide](https://lucide.dev/), avec une personnalisation pour le smiley "Déguster".

**⚠️ Ne pas utiliser d'emojis** — Toutes les icônes doivent être des SVG stroke pour garantir la cohérence visuelle et le bon fonctionnement des états actif/inactif avec le changement de couleur.

---

## 7. Animations et Transitions

### Principes
- **Durée** : 150-200ms pour les micro-interactions
- **Easing** : ease-out pour les apparitions, ease-in-out pour les transformations
- **Sobriété** : éviter les animations excessives

### Transitions standards

```css
/* Changement d'état (hover, focus) */
transition: all 0.2s ease;

/* Opacité nav items */
transition: opacity 0.2s;

/* Hover sur stats */
transition: background 0.2s;

/* Boutons pressés */
.button:active {
  transform: scale(0.93);
  transition: transform 0.15s;
}

/* Focus input */
transition: border-color 0.2s;
```

---

## 8. États et Interactions

### Inputs
- **Default** : border `--border`
- **Focus** : border `--accent`
- **Placeholder** : couleur `--text-muted`

### Boutons
- **Hover** : léger changement d'opacité ou background
- **Active** : scale(0.93)
- **Disabled** : opacity 0.5, cursor not-allowed

### Items de liste
- **Default** : fond `--bg-card`, ombre `--shadow-sm`
- **Tap/Press** : léger assombrissement ou scale subtil

### Navigation
- **Inactive** : opacity 0.4
- **Active** : opacity 1, couleur `--accent`

---

## 9. Responsive et Safe Areas

### Mobile-first
Design optimisé pour 375px de large (iPhone standard).

### Safe areas iOS
```css
.nav-bar {
  padding-bottom: 28px; /* safe area bottom */
}

.content {
  padding-bottom: 76px; /* nav height */
}

/* Avec scan zone */
.content-with-scan {
  padding-bottom: 148px; /* scan zone + nav + gap */
}
```

### Scroll
```css
.scrollable-list {
  overflow-y: auto;
  scrollbar-width: none;
}

.scrollable-list::-webkit-scrollbar {
  display: none;
}
```

---

## 10. Implémentation

### Variables CSS complètes

```css
:root {
  /* Backgrounds */
  --bg: #F7F4EF;
  --bg-card: #FFFFFF;
  --accent-bg: #FAF6ED;
  
  /* Text */
  --text-primary: #1A1A1A;
  --text-secondary: #6B6560;
  --text-muted: #A09A93;
  
  /* Accent */
  --accent: #B8860B;
  --accent-light: #D4A843;
  
  /* Border */
  --border: #E8E3DA;
  
  /* Wine colors */
  --red-wine: #722F37;
  --white-wine: #C8B560;
  --rose-wine: #D4917A;
  --champagne: #DAC17C;
  
  /* Shadows */
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.04);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.06);
  
  /* Radii */
  --radius: 14px;
  --radius-sm: 10px;
}
```

### Reset de base recommandé

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'DM Sans', sans-serif;
  background: var(--bg);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
}
```

---

## 11. Checklist d'implémentation

- [ ] Importer les polices Google Fonts
- [ ] Définir les variables CSS root
- [ ] Implémenter la nav bar avec backdrop-filter
- [ ] Créer le composant wine-list-item réutilisable
- [ ] Implémenter le header d'écran standardisé
- [ ] Créer la stats-row avec couleurs de vin
- [ ] Implémenter la search bar avec icône
- [ ] Créer la scan zone flottante
- [ ] Gérer les safe areas iOS
- [ ] Tester les transitions et états

---

## 12. Ressources

- **Polices** : [Google Fonts - Playfair Display](https://fonts.google.com/specimen/Playfair+Display), [DM Sans](https://fonts.google.com/specimen/DM+Sans)
- **Icônes** : [Lucide](https://lucide.dev/) (recommandé) ou [Feather](https://feathericons.com/)
- **Couleurs vin** : Inspirées des robes réelles des vins

---

*Ce design system est conçu pour être implémenté en React Native, Flutter, ou tout framework mobile. Les valeurs sont données en pixels mais peuvent être converties en rem/em ou unités spécifiques à la plateforme.*
