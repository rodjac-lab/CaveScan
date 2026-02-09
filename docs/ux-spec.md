# CaveScan — Spécification UX & Layout v1

> **Objectif** : restructurer les écrans et la navigation de CaveScan pour une meilleure ergonomie mobile.
> Ce document couvre uniquement le layout et l'UX. Le design system (couleurs, typographie, tokens) fera l'objet d'une spec séparée.

---

## 1. Architecture de navigation

### 1.1 Bottom Navigation Bar — 4 onglets

| Position | Label      | Icône        | Route     | Rôle                                    |
|----------|------------|--------------|-----------|------------------------------------------|
| 1        | Cave       | Home         | `/cave`   | Inventaire, stats, recherche             |
| 2        | Entrée     | PlusSquare   | `/add`    | Ajout de bouteilles (unitaire ou batch)  |
| 3        | Ouvrir     | Smile (☺)    | `/remove` | Sortie de cave, ouverture, dégustation   |
| 4        | Réglages   | Settings     | `/settings` | Zones, compte, paramètres              |

**Pas de bouton Scan central** dans la nav bar. Les actions de scan sont intégrées dans chaque écran (Entrée et Ouvrir).

### 1.2 Route par défaut

**Conserver** : La route `/` redirige vers `/remove` (écran Ouvrir).

Raisonnement produit : la plus grosse friction pour un amateur de vin est d'enregistrer les sorties de cave, pas de consulter son inventaire. En ouvrant l'app directement sur l'écran "Ouvrir", on maximise la probabilité que l'utilisateur enregistre sa bouteille au moment où il l'ouvre. Zéro friction, zéro navigation.

### 1.3 Header global

**Supprimer** le header sticky global (`Header.tsx`) qui contient "CaveScan" + icône Search.

Raisons :
- Le titre "CaveScan" est redondant avec le branding intégré dans chaque écran.
- L'icône Search renvoie vers `/search`, une page séparée qu'on va supprimer.
- Supprimer le header libère ~56px de hauteur sur chaque écran — précieux sur mobile.

Chaque écran gère son propre header (titre + actions contextuelles).

### 1.4 Page Search (`/search`) — À supprimer

La page `/search` devient redondante car la recherche est intégrée directement dans l'écran Cave.
- **Supprimer** la route `/search` de `App.tsx`.
- **Supprimer** le fichier `src/pages/Search.tsx`.
- **Supprimer** le `<Link to="/search">` du Header (qui est lui-même supprimé).

---

## 2. Écran Cave (`/cave` — Home.tsx)

### 2.1 Structure verticale (de haut en bas)

```
┌─────────────────────────────────┐
│ Status bar (iOS/Android)        │
├─────────────────────────────────┤
│ CAVESCAN (brand)                │
│ Ma Cave                (titre)  │
│ 3 caves · 47 bouteilles (sous) │
├─────────────────────────────────┤
│ [28]  [11]  [5]   [3]          │  ← Stats cliquables (filtres)
│ Rouges Blancs Bulles Rosés      │
├─────────────────────────────────┤
│ 🔍 Rechercher un vin, domaine… │  ← Barre de recherche
├─────────────────────────────────┤
│ Entrées récentes    [Filtrer →] │  ← Section header
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ 02  │▌ Domaine Dugat-Py   3│ │  ← Liste scrollable
│ │ Fév │  Gevrey-Ch. · 2019   │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ 02  │▌ Chartogne-Taillet  2│ │
│ │ Fév │  Champagne           │ │
│ └─────────────────────────────┘ │
│ ...                             │
│                                 │
├─────────────────────────────────┤
│ [Cave] [Entrée] [Ouvrir] [Régl] │  ← Nav bar
└─────────────────────────────────┘
```

### 2.2 Header de page (remplace le header global)

- **Ligne 1** : Branding "CAVESCAN" — petites capitales, letterspacing élevé, couleur accent.
- **Ligne 2** : Titre "Ma Cave" — grande taille, bold.
- **Ligne 3** : Sous-titre dynamique — `"{n} caves · {m} bouteilles"` (calculé depuis les données).

> Note : le sous-titre utilise le nombre de zones (caves) et le total de bouteilles en stock.

### 2.3 Stats cliquables

**Layout** : rangée horizontale de 4 cellules de largeur égale, séparées par des bordures verticales fines.

Chaque cellule contient (de haut en bas) :
1. Point de couleur (6px, rond) — couleur correspondante au type de vin.
2. Nombre — grande taille, police serif.
3. Label — petites capitales, texte muted.

**Données** :

| Cellule | Indicateur                     | Nombre                    | Label    |
|---------|--------------------------------|---------------------------|----------|
| 1       | Point rond `--red-wine`        | `bottles.filter(rouge)`   | ROUGES   |
| 2       | Point rond `--white-wine`      | `bottles.filter(blanc)`   | BLANCS   |
| 3       | Étoile/sparkle `--champagne`   | `bottles.filter(bulles)`  | BULLES   |
| 4       | Point rond `--rose-wine`       | `bottles.filter(rose)`    | ROSÉS    |

> **Distinction Blancs / Bulles** : Les couleurs `--white-wine` et `--champagne` sont proches (doré clair vs doré). Pour les différencier visuellement, l'indicateur Bulles n'est **pas un simple point** mais une **étoile à branches** (style sparkle/starburst, ~10px) qui évoque l'effervescence. Les 3 autres couleurs conservent un point rond simple (6px). L'étoile peut être implémentée en SVG inline ou en CSS (clip-path / pseudo-elements).

**Interaction** : Tap sur une cellule → filtre la liste en dessous par cette couleur. Tap à nouveau → désactive le filtre. La cellule active reçoit un fond léger (accent-bg). Un seul filtre actif à la fois.

> Ce comportement remplace les `FilterButton` actuels dans Home.tsx. On passe de boutons horizontaux scrollables à des cellules fixes visuellement intégrées.

### 2.4 Barre de recherche

- **Positionnée** entre les stats et la liste.
- **Placeholder** : `"Rechercher un vin, domaine, appellation..."`
- **Icône** : loupe à gauche dans le champ.
- **Comportement** : filtre la liste en temps réel (même logique que `searchBottles` dans l'actuel Search.tsx).
- **Cumul avec filtre couleur** : La recherche textuelle se cumule avec le filtre de couleur des stats.

> Cela remplace la page `/search` séparée. La logique de recherche de `Search.tsx` est intégrée dans `Home.tsx`.

### 2.5 Liste "Entrées récentes"

**Section header** :
- Gauche : titre "Entrées récentes" (police serif, 16px).
- Droite : lien "Filtrer →" (couleur accent) — ouvrira à terme un panneau de filtres avancés (zone, millésime, etc.). Pour l'instant, ce lien ne fait rien (placeholder).

**Chaque item de la liste** :

```
┌───────────────────────────────────────────────┐
│ [Date]  ▌  [Infos]                    [Qty]  │
│  02     ▌  Domaine Dugat-Py           3 btl  │
│  Fév    ▌  Gevrey-Chambertin · 2019          │
└───────────────────────────────────────────────┘
```

Composants d'un item :
1. **Date** (gauche, 36px fixe) : Jour en grand (serif, 17px, bold), mois en petites capitales (9px, muted). Utilise le champ `added_at` de la bouteille.
2. **Barre de couleur** : trait vertical (3px large, 32px haut, arrondi) — couleur selon `couleur` du vin. Couleurs : `rouge` → `--red-wine`, `blanc` → `--white-wine`, `bulles` → `--champagne`, `rose` → `--rose-wine`, `null` → gris muted.
3. **Infos** (flex:1) : Nom du domaine (13px, medium, truncate) + détail (11px, muted) = appellation · millésime.
4. **Quantité** (droite, flex-shrink:0) : Nombre en serif bold + "btl" en petit muted.

**Tri** : Par `added_at` décroissant (les plus récentes en haut). C'est le tri par défaut et le seul tri pour l'instant.

**Groupement** : Les bouteilles identiques (même domaine, cuvée, appellation, millésime, couleur) ajoutées le même jour sont **groupées** en un seul item avec la quantité totale. C'est un changement majeur par rapport à l'affichage actuel où chaque bouteille est une ligne séparée.

> **Logique de groupement** : Grouper les bouteilles qui partagent les mêmes valeurs de `domaine`, `cuvee`, `appellation`, `millesime`, `couleur` ET dont le `added_at` tombe le même jour calendaire. Afficher la quantité du groupe. Au tap, naviguer vers la vue détaillée (future : liste des bouteilles du groupe ; pour l'instant : naviguer vers la première bouteille du groupe).

**Fond** : chaque item a un fond blanc (card), border-radius, légère ombre.

**Scroll** : la liste occupe tout l'espace restant et scrolle verticalement. Le padding-bottom tient compte de la nav bar.

### 2.6 État vide

Si l'utilisateur n'a aucune bouteille en stock :
- Icône Wine centrée, grande, muted.
- Texte : "Votre cave est vide.\nAjoutez votre première bouteille !"
- Bouton CTA vers `/add`.

---

## 3. Écran Entrée (`/add` — AddBottle.tsx)

### 3.1 Structure verticale

```
┌─────────────────────────────────┐
│ Status bar                      │
├─────────────────────────────────┤
│ CAVESCAN                        │
│ Entrée                          │
│ Ajouter des bouteilles à la cave│
├─────────────────────────────────┤
│                                 │
│  Zone de scan                   │
│  (Camera + Galerie + Manuel)    │
│                                 │
├─────────────────────────────────┤
│  ... (formulaire après scan)    │
│                                 │
├─────────────────────────────────┤
│ [Cave] [Entrée] [Ouvrir] [Régl] │
└─────────────────────────────────┘
```

### 3.2 Changements par rapport à l'existant

L'écran AddBottle.tsx fonctionne bien en termes de flow (capture → extraction → formulaire → save). Les changements sont principalement cosmétiques et structurels :

1. **Supprimer le header global** : le titre "Ajouter une bouteille" actuel (`<h1>`) devient le header de page avec le branding CAVESCAN au-dessus.
2. **Renommer** : le titre passe de "Ajouter une bouteille" à "Entrée". Le sous-titre "Ajouter des bouteilles à votre cave" donne le contexte.
3. **Zone de scan** : les boutons Photographier / Choisir une photo restent mais adoptent le nouveau style (voir section Design System, spec séparée).
4. **Formulaire** : pas de changement fonctionnel. Le formulaire avec autocomplete domaine/appellation, sélecteur de quantité, zone de stockage, etc. reste identique.

### 3.3 Aucun changement fonctionnel

L'intégralité de la logique métier (extraction IA via Supabase edge function, upload photo, compression, insertion multiple en base) reste **inchangée**. Seul le layout visuel évolue.

---

## 4. Écran Ouvrir (`/remove` — RemoveBottle.tsx)

### 4.1 Structure verticale — nouveau layout

```
┌─────────────────────────────────┐
│ Status bar                      │
├─────────────────────────────────┤
│ CAVESCAN                        │
│ Ouvrir                          │
│ On ouvre une bonne bouteille ?  │
├─────────────────────────────────┤
│ ── OUVERTURES RÉCENTES ──       │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ 01  │▌ Storm Hemel-en-A.   │ │  ← Liste scrollable
│ │ Fév │  Pinot Noir · 2022   │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ 01  │▌ Chevassu-Fassenet   │ │
│ │ Fév │  Côtes du Jura · 2021│ │
│ └─────────────────────────────┘ │
│ ...                             │
│                                 │
├─────────────────────────────────┤
│ [Galerie] Scanner un vin [Cam]  │  ← Zone scan (dans le flow, pas flottante)
├─────────────────────────────────┤
│ [Cave] [Entrée] [Ouvrir] [Régl] │
└─────────────────────────────────┘
```

### 4.2 Changements majeurs par rapport à l'existant

#### A. Suppression de la barre de recherche

La barre de recherche actuellement dans RemoveBottle.tsx (`searchQuery` + `filteredBottles`) est **supprimée** de cet écran. La recherche se fait désormais depuis l'écran Cave.

> Raisonnement : quand on ouvre une bouteille, on l'a déjà en main. On scanne l'étiquette OU on la retrouve dans l'historique des ouvertures. La recherche "trouver une bouteille dans ma cave" est un use case de l'écran Cave.

#### B. Zone de scan déplacée en bas

La zone de scan (actuellement en haut de l'écran, prenant beaucoup de place) est déplacée **en bas**, juste au-dessus de la nav bar.

**Layout de la zone scan** :

```
┌──────────────────────────────────────────┐
│ (🖼)    Scanner un vin      (📷)         │
│         Photo ou galerie                 │
└──────────────────────────────────────────┘
```

- **Bouton Galerie** (gauche) : rond, fond léger, icône image. Ouvre le sélecteur de fichiers.
- **Texte central** : "Scanner un vin" (titre, serif, bold) + "Photo ou galerie" (sous-titre, muted).
- **Bouton Camera** (droite) : rond, fond accent (gradient doré), icône caméra blanche. Ouvre la caméra.

**Position** : La zone scan est **dans le flow du layout** (pas en `position: absolute`). Elle est placée entre la liste et la nav bar dans la structure flex du composant. La liste scrolle naturellement au-dessus, rien ne passe dessous la zone scan.

**Implémentation** : La zone scan utilise les mêmes `<input type="file">` refs (`fileInputRef`, `fileInputGalleryRef`) que le code actuel. Seul le rendu visuel change.

#### C. Liste "Ouvertures récentes" — format unifié

La liste des ouvertures récentes utilise le **même format** que la liste de l'écran Cave :

Composants d'un item :
1. **Date** (gauche) : jour + mois, utilise `drunk_at`.
2. **Barre de couleur** : identique à Cave.
3. **Infos** : domaine + appellation · millésime.
4. **Contexte** (droite, à la place de la quantité) : texte muted indiquant la provenance — "Ma cave", "Restaurant", "Chez amis", etc.

> Note : le champ "contexte/provenance" n'existe pas encore dans le modèle de données. Pour l'instant, afficher "Ma cave" si la bouteille avait un `zone_id` (elle venait de l'inventaire), ou ne rien afficher si elle a été créée directement comme "drunk" (dégustation hors cave). L'ajout d'un champ `tasting_context` dans la table bottles est une évolution future.

**Données** : utilise le hook `useRecentlyDrunk()` existant (requête sur `status = 'drunk'`, tri par `drunk_at` desc, limit 10). Augmenter le limit à 20 ou 30 pour remplir l'écran.

#### D. Flow après scan — pas de changement

Le flow après scan (extraction → matching → select → confirm → save) reste **identique**. Les étapes `extracting`, `matching`, `select`, `confirm`, `not_found`, `saving` sont conservées telles quelles.

La seule différence : quand `step !== 'choose'`, la zone de scan en bas et la liste des sorties sont remplacées par le contenu du step actuel (loader, liste de matchs, confirmation, etc.) — comme c'est déjà le cas dans le code actuel.

### 4.3 Suppression du lien "ou rechercher"

Le séparateur `"ou rechercher"` et la barre de recherche en dessous sont supprimés de l'étape `choose`. L'utilisateur qui veut chercher un vin dans sa cave va sur l'écran Cave.

---

## 5. Écran Réglages (`/settings` — Settings.tsx)

### 5.1 Changements

Changements mineurs :

1. **Header de page** : même pattern que les autres — branding CAVESCAN + titre "Réglages" + sous-titre optionnel.
2. **Supprimer la section Debug** : la section "Debug connexion" avec l'URL Supabase, le User ID et "Auth OK" doit être retirée de l'interface de production. Si nécessaire, la garder cachée derrière un geste secret (5 taps sur "v1.0.0" par exemple).
3. **Reste identique** : les sections Compte et Zones de stockage restent telles quelles.

---

## 6. Fiche bouteille (`/bottle/:id` — BottlePage.tsx)

### 6.1 Changements

1. **Bouton retour** : le bouton `← Retour` reste, mais le header global au-dessus disparaît (puisqu'on le supprime globalement).
2. **Reste identique** : la fiche bouteille avec photos, détails, note de dégustation, partage, "marquer comme bue" — tout reste fonctionnellement identique.

---

## 7. Édition bouteille (`/bottle/:id/edit` — EditBottle.tsx)

**Aucun changement** fonctionnel ou structurel. Seul le header global disparaît.

---

## 8. Pages Auth (Login / Signup)

**Aucun changement**. Ces pages ont leur propre layout sans header ni nav bar.

---

## 9. Résumé des fichiers impactés

| Fichier                      | Action                                                        |
|------------------------------|---------------------------------------------------------------|
| `App.tsx`                    | Supprimer `<Header />`, supprimer route `/search`         |
| `components/Header.tsx`      | **Supprimer** le fichier                                      |
| `components/BottomNav.tsx`   | Renommer "Ajouter" → "Entrée", renommer "Déguster" → "Ouvrir", changer icône Wine → Smile |
| `pages/Home.tsx`             | **Refonte majeure** : ajouter header de page, stats cliquables, recherche intégrée, liste avec dates et groupement |
| `pages/RemoveBottle.tsx`     | **Refonte layout** : supprimer recherche, déplacer scan en bas, reformatter liste sorties, titre "Ouvrir" |
| `pages/AddBottle.tsx`        | **Changements mineurs** : header de page avec branding                      |
| `pages/Search.tsx`           | **Supprimer** le fichier                                      |
| `pages/Settings.tsx`         | Changements mineurs : header de page, supprimer section debug |
| `pages/BottlePage.tsx`       | Aucun changement fonctionnel                                  |
| `pages/EditBottle.tsx`       | Aucun changement fonctionnel                                  |
| `hooks/useBottles.ts`        | Augmenter limit de `useRecentlyDrunk` (10 → 30)              |

---

## 10. Récapitulatif des décisions UX

| Décision                                    | Justification                                            |
|---------------------------------------------|----------------------------------------------------------|
| Pas de bouton Scan dans la nav              | Le scan est contextuel (entrée vs dégustation)           |
| `/remove` comme page d'accueil              | Zéro friction à la sortie — le plus gros point de perte  |
| "Ouvrir" plutôt que "Déguster"              | Ton convivial, évoque le plaisir d'ouvrir une bouteille  |
| Étoile sparkle pour les Bulles              | Différencie visuellement des Blancs (couleurs proches)   |
| Recherche intégrée dans Cave                | Un seul endroit pour chercher, pas de page dédiée        |
| Stats = filtres cliquables                  | Les stats ne sont pas décoratifs, ils sont fonctionnels  |
| Scan en bas sur Ouvrir                      | Zone de pouce (thumb zone), plus facile à atteindre      |
| Scan dans le flow (pas flottant)            | Évite le scroll de contenu sous la zone scan             |
| Liste avec dates + barres de couleur        | Plus scannable visuellement que l'icône Wine actuelle    |
| Groupement des bouteilles identiques        | Évite les doublons visuels (3 lignes pour 3 Dugat-Py)   |
| Suppression du header global                | Gain de 56px verticaux, chaque écran est autonome        |
| Suppression de la page Search               | Redondante avec la recherche intégrée dans Cave          |

---

## 11. Ce qui n'est PAS couvert par cette spec

- **Design system** (couleurs, typographie, tokens CSS, icônes) → spec séparée.
- **Notation / scoring** des dégustations → décision reportée (convention 20/100/lettres non tranchée).
- **Champ `tasting_context`** (provenance de la dégustation) → évolution future du modèle de données.
- **Filtres avancés** (zone, millésime, région) → le bouton "Filtrer →" est un placeholder pour une version future.
- **Écran détail d'un groupe de bouteilles** → pour l'instant, tap sur un groupe ouvre la première bouteille.
- **Dark mode vs Light mode** → sera traité dans la spec Design System.
