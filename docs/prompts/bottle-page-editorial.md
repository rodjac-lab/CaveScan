# CaveScan — Refonte BottlePage : Proposition B "Fiche Éditoriale"

## Contexte

Tu interviens sur **CaveScan**, une app mobile React Native de gestion de cave à vin. Tu dois refondre l'écran **BottlePage** (fiche détail d'une bouteille) en suivant strictement la maquette validée ci-dessous.

**L'écran actuel a ces problèmes :**
- La photo occupe ~45% du viewport et pousse tout le contenu sous le fold
- La note de dégustation est invisible sans scroll — or c'est le cœur du flux "Partager"
- Les boutons d'action (Enregistrer, Partager) sont cachés en bas
- Le nom du domaine apparaît en doublon (header + carte infos)

---

## Design retenu : "Fiche Éditoriale"

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
   - Bouton "Enregistrer" → sauvegarde la note de dégustation
   - Bouton "Share" → déclenche le partage WhatsApp
   - Tap sur la photo → ouvre en plein écran ou lightbox
   
   → Vérifie que chaque action est correctement câblée et ne casse pas le navigation stack.

3. **Données dynamiques** : L'écran reçoit les données de la bouteille en paramètre (route params ou context). Assure-toi que :
   - Le nom du domaine, la cuvée, l'appellation, le millésime, la couleur sont dynamiques
   - La wine-color-bar dans le header utilise la bonne couleur selon `bottle.color` (rouge/blanc/rosé/champagne)
   - La date affichée est la date de dégustation (si bouteille bue) ou la date d'entrée en cave
   - La note de dégustation est éditable et se sauvegarde
   - La photo est celle de la bouteille (avec fallback sur un placeholder #e8e3da)

4. **État de la bouteille** : L'écran doit s'adapter selon `bottle.status` :
   - `in_stock` → la date affichée est la date d'entrée, la cellule "Prix" montre le prix d'achat
   - `drunk` → la date affichée est la date de dégustation, un indicateur visuel peut marquer le statut

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

### 3. Tests de l'écran BottlePage
- [ ] Le layout correspond exactement à la maquette (photo 90×120 à gauche, infos à droite)
- [ ] Les polices sont correctes (Playfair Display pour le domaine/millésime, DM Sans pour le reste)
- [ ] Les couleurs respectent le design system (vérifier les tokens un par un)
- [ ] La wine-color-bar affiche la bonne couleur selon le type de vin
- [ ] Les tags (millésime, couleur) sont affichés en pills
- [ ] La barre de détails (date, prix, lieu) affiche les bonnes données
- [ ] Le divider "Dégustation" utilise le bon pattern (lignes + label centré)
- [ ] La note de dégustation est visible sans scroll sur un iPhone standard (375px)
- [ ] Le textarea est éditable, le clavier s'ouvre correctement
- [ ] Le bouton "Enregistrer" sauvegarde la note
- [ ] Le bouton "Share" déclenche le partage
- [ ] Le bouton "back" ramène à l'écran précédent
- [ ] Le bouton "edit" ouvre le formulaire d'édition
- [ ] La photo est cliquable (zoom/lightbox)
- [ ] Le bottom spacer (90px) empêche le contenu d'être masqué par la nav bar

### 4. Tests de navigation (après cet écran)
- [ ] Depuis BottlePage, retour arrière → l'écran d'origine est intact
- [ ] Depuis BottlePage, edit → formulaire → retour → BottlePage affiche les données mises à jour
- [ ] Depuis BottlePage, partage WhatsApp → retour → BottlePage est toujours dans le bon état
- [ ] Aucun écran de l'app n'est cassé après la refonte

### 5. Tests edge cases
- [ ] Bouteille sans photo → le placeholder #e8e3da s'affiche
- [ ] Bouteille sans note de dégustation → le placeholder italic s'affiche dans le textarea
- [ ] Bouteille sans prix → afficher "—"
- [ ] Nom de domaine très long → ellipsis ou wrap propre (pas de débordement)
- [ ] Appellation très longue → idem
- [ ] Note de dégustation très longue → le textarea grandit, le scroll fonctionne
- [ ] Orientation paysage → layout ne casse pas (si supporté)

### 6. Tests de performance
- [ ] Pas de re-render inutile quand on tape dans le textarea
- [ ] L'animation d'entrée est fluide (60fps)
- [ ] Pas de flash blanc au chargement de la photo

---

## Résumé des fichiers impactés

Le scope exact dépend de l'architecture existante, mais au minimum :
- `BottlePage.tsx` (ou équivalent) — **refonte complète du composant**
- Styles associés — **réécriture selon les specs ci-dessus**
- Navigation config — **vérifier que les routes restent intactes**

**Ne touche PAS** aux fichiers suivants sauf si strictement nécessaire :
- Les autres écrans (Cave, Encaver, Partager, Réglages)
- Les composants partagés (NavBar, WineListItem, etc.) — sauf si un ajustement mineur est requis
- La logique métier (sauvegarde, API, state management)

---

## Référence visuelle

Le fichier `proposal-b.html` dans le repo contient la maquette HTML/CSS pixel-perfect de cet écran. Utilise-le comme référence visuelle absolue. En cas de doute entre ce prompt et la maquette HTML, **la maquette HTML fait foi**.
