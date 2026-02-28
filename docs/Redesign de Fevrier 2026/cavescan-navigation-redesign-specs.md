# CaveScan — Refonte navigation & écran Découvrir

## Specs pour implémentation · Février 2026

---

## 1. Vue d'ensemble

Refonte majeure de la navigation de CaveScan. On passe d'une architecture 4 onglets (Cave · Encaver · Partager · Réglages) à une architecture **5 onglets** avec un scanner central surélevé et un nouvel écran "Découvrir" alimenté par l'IA.

### Navigation actuelle → Navigation cible

```
AVANT:  Cave · Encaver · Partager · Réglages
APRÈS:  Cave · Dégustations · [Scanner] · Découvrir · Réglages
```

### Principes directeurs
- Séparer les **destinations** (où je vais) des **actions** (ce que je fais)
- "Encaver" et "Partager" sont des actions, pas des destinations → ils disparaissent comme onglets
- Les dégustations méritent leur propre espace dédié
- Le scanner est l'action principale → il prend la position centrale surélevée
- "Découvrir" crée de l'engagement même sans bouteille à scanner

---

## 2. Barre de navigation (5 onglets)

### Layout
- **5 items** disposés en symétrie 2-1-2
- Reprend le style actuel de la nav bar : `background: rgba(255,255,255,0.92)`, `backdrop-filter: blur(20px)`, `border-top: 1px solid var(--border)`
- Padding : `10px 16px 28px` (réduit de 24px à 16px horizontal pour accommoder 5 items)
- Le bouton Scanner central est **surélevé** au-dessus de la barre (margin-top négatif)

### Onglets (de gauche à droite)

| Position | Label | Icône | Description |
|----------|-------|-------|-------------|
| 1 | Cave | Maison (home) | Inventaire des bouteilles |
| 2 | Dégustations | Calendrier | Historique des notes de dégustation |
| 3 (centre) | Scanner | QR/Scan dans cercle surélevé | Bouton principal, dégradé doré |
| 4 | Découvrir | Loupe/Compass | Accords, suggestions IA, exploration |
| 5 | Réglages | Engrenage | Paramètres, profil, export |

### Style du bouton Scanner
- Cercle de 52px
- Dégradé doré (--accent: #B8860B)
- Surélevé de -22px au-dessus de la nav bar
- Ombre portée dorée
- L'icône est un symbole de scan/QR code

### États actifs
- Onglet actif : `opacity: 1`, icône et label en `--accent` (#B8860B)
- Onglets inactifs : `opacity: 0.4`, couleur `--text-primary` (cohérent avec le DS actuel)
- Icônes : 22×22px, stroke-width: 2 (Lucide/Feather)
- Labels : 10px, font-weight 500, DM Sans

---

## 3. Écran Scanner — Interface caméra full-screen

### Concept
L'écran Scanner est une **expérience caméra immersive**, style WhatsApp. Pas de nav bar, pas de header classique. Fond noir, interface photo.

### Structure de l'écran (de haut en bas)

#### 3.1 Status bar
- Style clair sur fond sombre (texte et icônes en blanc)
- Fond transparent (le viewfinder est visible derrière)

#### 3.2 Viewfinder (zone principale)
- Occupe la majorité de l'écran
- Fond sombre (flux caméra en production)
- **Top bar flottante** :
  - Bouton X (fermer) en haut à gauche — cercle 36px, fond noir semi-transparent + blur
  - Bouton flash en haut à droite — même style
- **Guide de cadrage** centré dans le viewfinder :
  - Rectangle vertical (~200x260px) matérialisé par 4 coins dorés (coins arrondis, bordure fine)
  - Texte "Cadrez l'étiquette" en dessous, petit, blanc semi-transparent
  - Les coins ont la couleur accent dorée avec opacité 0.8

#### 3.3 Barre de contrôles caméra
- Fond noir (#0A0A0A)
- 3 éléments alignés horizontalement :
  - **Galerie** (gauche) : Miniature 44x44px, coins arrondis 10px, bordure blanche semi-transparente. Affiche la dernière photo de la pellicule. Tap → ouvre le picker photo natif.
  - **Déclencheur** (centre) : Cercle blanc 64px avec bordure blanche de 3px et padding intérieur. Style identique au shutter iOS.
  - **Espace vide** (droite) : Pour la symétrie, 44px de large.

#### 3.4 Sélecteur d'intention
- Fond noir
- 2 pills côte à côte, centrées :
  - **"Encaver"** — icône maison + texte
  - **"Déguster"** — icône crayon/note + texte
- La pill active a un fond rouge vin (--red-wine: #722F37) et texte blanc
- La pill inactive a un fond transparent, bordure blanche 10%, texte blanc 40%
- L'intention est sélectionnée **avant ou après** la photo
- Par défaut, "Encaver" est actif

#### 3.5 Pas de nav bar
- L'écran caméra est full-screen, immersif
- On en sort par le bouton X ou en terminant le flux (photo prise → redirection vers le formulaire d'encavage ou de dégustation)

### Flux utilisateur
1. Tap sur Scanner dans la nav bar → ouverture caméra plein écran
2. L'utilisateur choisit son intention (Encaver ou Déguster) via les pills en bas
3. L'utilisateur prend une photo (déclencheur) ou choisit depuis la galerie
4. La photo est envoyée à l'API de reconnaissance (Claude/Gemini)
5. Redirection vers le formulaire correspondant (encavage ou dégustation) avec les données pré-remplies par l'IA

---

## 4. Écran Dégustations — Destination autonome

### Concept
Les dégustations ne sont plus une sous-fonction de "Partager". Elles ont leur propre onglet avec un historique consultable, des filtres, et la possibilité de partager individuellement chaque note.

### Structure
- **Header** : Titre "Dégustations" + bouton filtre/recherche
- **Timeline** : Liste chronologique des dégustations
- Chaque carte de dégustation affiche :
  - Nom du vin, appellation, millésime
  - Note (étoiles)
  - Extrait de la note de dégustation
  - Badge "Partagé" si la note a été envoyée
  - Date de dégustation
- Le bouton de partage WhatsApp est **dans chaque fiche** de dégustation (pas dans la navigation)

### Actions disponibles
- Recherche par nom de vin
- Filtre par type (rouge/blanc/rosé/champagne)
- Filtre par note
- Tap sur une dégustation → détail complet avec option de partage

---

## 5. Écran Découvrir — Le nouvel onglet IA

### Concept
L'onglet "Découvrir" est le cœur de l'engagement quotidien. Il donne une raison d'ouvrir l'app même sans bouteille à scanner. Tout le contenu est alimenté par l'IA.

### Structure de l'écran (3 modules)

#### 5.1 Module "Accords parfaits" (en haut)

Un module de recherche d'accords mets-vins **bidirectionnel**.

**Toggle** en haut du module :
- "Ce soir je mange..." → l'utilisateur tape un plat, l'IA suggère un vin
- "Ce soir je bois..." → l'utilisateur tape un vin/cépage, l'IA suggère un plat

Le toggle est un composant pill/segment avec 2 options. L'option active a un fond blanc avec texte doré et une légère ombre. L'option inactive est grisée.

**Champ de recherche** en dessous du toggle :
- Style input avec icône loupe à gauche
- Placeholder dynamique selon le mode :
  - Mode "je mange" : "Poulet rôti, sushi, raclette..."
  - Mode "je bois" : "Sancerre, Pinot Noir, Champagne..."

**Tags rapides** (quick suggestions) :
- Petites pills horizontales scrollables sous le champ
- Mode "je mange" : Poulet rôti, Poisson, Fromage, Apéro, Dessert
- Mode "je bois" : Rouge, Blanc, Rosé, Champagne, Nature

**Carte résultat IA** :
- Apparaît après sélection/recherche
- Badge "Suggestion IA" avec icône étoile dorée
- Nom du vin (ou du plat en mode inversé)
- Appellation, type, + mention "Dans votre cave" si applicable
- Explication de l'accord en italique
- Badge "Accord" doré

#### 5.2 Module "Ouvrez ce soir" (carousel horizontal)

Suggestions de bouteilles à ouvrir, basées sur la cave de l'utilisateur.

**Format : carousel horizontal swipeable** (pas de liste verticale)
- Les cartes défilent horizontalement avec scroll snap
- Dots de pagination en dessous (le dot actif est un rectangle doré allongé, les autres sont des cercles gris)
- Chaque carte fait ~220px de large

**Contenu de chaque carte** :
- Badge en haut à gauche (type de suggestion) :
  - "À boire" (badge rose/rouge) — fenêtre de maturité
  - "Favori" (badge doré) — vin bien noté
  - "Saison" (badge doré) — suggestion saisonnière
- Nom du vin (Playfair Display, bold)
- Appellation · Type
- Séparateur fin
- Raison de la suggestion en italique (ex: "Fenêtre de dégustation idéale 2024-2030")
- Footer : nombre de bouteilles en cave + note

**Barre latérale colorée** à gauche de chaque carte (3px) :
- Rouge → vin rouge (--red-wine)
- Jaune → vin blanc (--white-wine)
- Rose → rosé (--rose-wine)
- Or → champagne (--champagne)

**Logique de suggestion** (pour plus tard, pas besoin d'implémenter l'algo maintenant) :
- Fenêtre de maturité (vins dans leur période optimale)
- Vins les mieux notés par l'utilisateur
- Suggestions saisonnières (rosé au printemps/été, rouge corsé en hiver)
- Vins oubliés (en cave depuis longtemps, jamais dégustés)

#### 5.3 Module "Explorer" (en bas, scrollable)

Cartes de découverte pour régions, cépages, et domaines.

**Format : cartes empilées verticalement**

Chaque carte contient :
- **Bandeau visuel** en haut (72px de haut) avec dégradé de couleur et nom en blanc (Playfair Display, bold)
  - Bourgogne → dégradé rouge vin sombre
  - Champagne → dégradé doré
  - Bordeaux → dégradé rouge profond
  - etc.
- **Corps** avec :
  - Description courte (2 lignes max)
  - Stats personnalisées : "X vins en cave · X dégustés · X appellations"

**Contenu futur** (pas nécessaire au lancement) :
- Explorer un domaine spécifique (fiche domaine + cuvées + prix)
- Explorer un cépage (carte des régions, profil aromatique)
- Contenu personnalisé basé sur l'historique de l'utilisateur

---

## 6. Enrichissement du prompt IA de scan

### Contexte
Le call API pour la reconnaissance d'étiquette est déjà payé (le coût est dominé par l'image en input). On enrichit le prompt pour extraire plus de valeur du même appel.

### Prompt actuel (reconnaissance simple)
Identifie le vin à partir de l'étiquette → retourne nom, domaine, appellation, millésime.

### Prompt enrichi (à implémenter)
En plus de l'identification, demander dans le même appel :
- **Cépage(s) principal(aux)** et proportions si assemblage
- **Température de service** recommandée
- **Profil aromatique typique** : 3-4 arômes à chercher (ex: "cerise griotte, épices douces, cuir")
- **Accords mets** : 2-3 suggestions de plats
- **Caractère du vin** : une phrase descriptive (ex: "Vin puissant et structuré, taillé pour la garde")

### Format de réponse attendu
Ajouter ces champs au JSON de réponse existant :
```json
{
  "name": "...",
  "domain": "...",
  "appellation": "...",
  "vintage": "...",
  "grape_varieties": ["Sangiovese 80%", "Canaiolo 15%", "Colorino 5%"],
  "serving_temperature": "16-18°C",
  "typical_aromas": ["cerise griotte", "épices douces", "cuir", "tabac"],
  "food_pairings": ["Pâtes à la sauce tomate", "Agneau grillé", "Pecorino affiné"],
  "character": "Vin charpenté aux tanins soyeux, bel équilibre entre puissance et élégance."
}
```

### Utilisation des données enrichies
- Les repères de dégustation (arômes, température) sont affichés sur l'écran de résultat après le scan, avant que l'utilisateur ne rédige sa note
- Les accords mets alimentent le module "Découvrir" à terme
- Le caractère du vin peut être utilisé comme point de départ pour la note de dégustation

---

## 7. Écran Cave (existant — pas de changement majeur)

L'écran Cave reste le même. Le seul changement est que la navigation en bas reflète la nouvelle structure 5 onglets.

---

## 8. Écran Réglages (existant — ajustements mineurs)

L'écran Réglages reste globalement le même. Ajustements :
- La section "Amis" (si elle existait dans Réglages) peut être déplacée dans le Profil utilisateur
- L'invitation WhatsApp peut rester accessible depuis Réglages ou depuis les fiches de dégustation

---

## 9. Routage et structure technique

### Routes à créer/modifier
```
/cave          → Écran Cave (existant)
/degustations  → Écran Dégustations (nouveau, basé sur l'ancien "Partager")
/scanner       → Écran Scanner (refonte complète → interface caméra)
/decouvrir     → Écran Découvrir (entièrement nouveau)
/reglages      → Écran Réglages (existant)
```

### Composants à créer
- `BottomNav` — Barre de navigation 5 onglets (refonte du composant existant)
- `ScannerCamera` — Interface caméra full-screen avec viewfinder, contrôles, et sélecteur d'intention
- `DegustationsScreen` — Liste/timeline des notes de dégustation
- `DecouvrirScreen` — Écran avec les 3 modules
  - `AccordModule` — Toggle je mange/je bois + recherche + résultat IA
  - `OuvrezCeSoirCarousel` — Carousel horizontal de suggestions
  - `ExploreCards` — Cartes régions/cépages/domaines
- `IntentPills` — Composant réutilisable pour le choix Encaver/Déguster

### Navigation
- La nav bar est visible sur tous les écrans SAUF le Scanner
- Le Scanner est un écran full-screen overlay (pas de nav bar, retour par le bouton X)
- Le bouton Scanner dans la nav bar ouvre l'interface caméra en overlay/modal plein écran

---

## 10. Design system — Conformité et mise à jour

### ⚠️ SOURCE DE VÉRITÉ : `docs/design-system.md`
Le fichier `docs/design-system.md` du repo est la référence absolue pour tous les styles existants.
Les valeurs dans ce document de specs sont un rappel — en cas de doute, **toujours se référer au design-system.md**.

Toutes les couleurs, typographies, ombres, rayons et espacements existants sont **inchangés**.
Ne pas inventer de nouvelles valeurs — utiliser exclusivement les tokens définis dans le DS.

### Mises à jour requises dans `docs/design-system.md`

Le passage de 4 à 5 onglets nécessite ces modifications dans le design system :

#### Section 5.1 Navigation Bar — MODIFIER

Remplacer la structure 4 onglets par :
```
Structure : 5 onglets (symétrie 2-1-2)
1. Cave (home icon)
2. Dégustations (calendar icon)
3. Scanner (scan icon — bouton surélevé central)
4. Découvrir (compass icon)
5. Réglages (settings icon)
```

Ajustements CSS :
```css
.nav-bar {
  /* Inchangé sauf padding horizontal réduit pour 5 items */
  padding: 10px 16px 28px; /* était 10px 24px 28px */
}
```

Ajouter le bouton Scanner surélevé :
```css
.nav-scanner-btn {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-light) 100%);
  box-shadow: 0 3px 12px rgba(184,134,11,0.25);
  margin-top: -22px; /* surélevé au-dessus de la barre */
  display: flex;
  align-items: center;
  justify-content: center;
}
.nav-scanner-btn svg { color: white; width: 22px; height: 22px; }
```

#### Section 6 Iconographie — COMPLÉTER

Ajouter les nouvelles icônes (même style Lucide, stroke-width: 2, stroke-linecap: round) :
- **Scanner** : icône viewfinder/scan (utilisée dans le bouton central doré, couleur blanche)
- **Dégustations** : `calendar` de Lucide
- **Découvrir** : `compass` de Lucide

#### Nouvelle section à ajouter — Interface Scanner caméra
L'écran Scanner est un overlay full-screen hors du layout standard :
- Fond noir (#0A0A0A), pas de nav bar
- Contrôles flottants avec `backdrop-filter: blur(10px)` sur fond noir semi-transparent
- Boutons circulaires 36px (fermer, flash) avec fond `rgba(0,0,0,0.5)`
- Guide de cadrage : coins dorés (--accent, opacity 0.8)
- Détails complets dans la section 3 de ce document

---

## 11. Mockup de référence

Le fichier HTML `cavescan-5tabs.html` contient les mockups visuels des 5 écrans. Il sert de référence visuelle pour l'implémentation.

**Important** : Les mockups montrent l'intention visuelle. En production, tout doit être plus compact (padding réduit, labels plus petits) pour que le contenu utile soit visible sans trop scroller.

---

## 12. Priorité d'implémentation

### Phase 1 — Navigation (critique)
1. Refonte de la barre de navigation 5 onglets
2. Routage vers les 5 écrans
3. Écran Scanner → interface caméra full-screen
4. Écran Dégustations → extraction depuis l'ancien "Partager"

### Phase 2 — Découvrir (haute priorité)
5. Écran Découvrir — structure et layout des 3 modules
6. Module "Accords parfaits" avec toggle et recherche
7. Module "Ouvrez ce soir" carousel (données statiques/mock d'abord)
8. Module "Explorer" avec cartes régions

### Phase 3 — IA enrichie (moyenne priorité)
9. Enrichissement du prompt de reconnaissance d'étiquette
10. Affichage des repères de dégustation post-scan
11. Connexion du module Accords à l'API IA
12. Suggestions dynamiques "Ouvrez ce soir" basées sur la cave réelle
