# CaveScan - Spécification UX & Layout v2

## Objectif

Définir une UX mobile-first claire, rapide et cohérente avec le produit actuel.

Principe directeur: minimiser la friction entre l’action réelle (ranger / ouvrir une bouteille) et la mise à jour de l’inventaire.

## Navigation

## Routes principales

- `/` : Landing (présentation + CTA signup/login)
- `/login` : Connexion
- `/signup` : Création de compte
- `/cave` : Inventaire
- `/scanner` : Scanner (plein écran, choix intent)
- `/add` : Entrée de bouteilles (Encaver)
- `/remove` : Sortie de bouteilles (Cheers!)
- `/discover` : Découvrir (Le Sommelier IA + exploration)
- `/settings` : Réglages
- `/bottle/:id` : Détail bouteille
- `/bottle/:id/edit` : Édition bouteille

## Bottom nav (authentifié) — 5 onglets

- Cave
- Cheers!
- [Scanner] (bouton central surélevé, gradient doré 52px)
- Découvrir
- Réglages

Règles:

- Visible uniquement sur les routes authentifiées (sauf `/scanner` qui est plein écran sans nav).
- Toujours accessible en bas de l’écran.
- Onglet actif visuellement explicite.
- Le bouton Scanner central n’est pas un NavLink : il ouvre une page plein écran avec 2 intent pills ("Encaver" → `/add`, "Déguster" → `/remove`), chacune déclenchant le flux avec `prefillExtraction` + `prefillPhotoFile` via `location.state`.

## Écran Cave (`/cave`)

## Rôle

Vue de pilotage de la cave: consultation, recherche, filtres, accès rapide aux fiches.

## Structure

1. Header de page
2. Statistiques par couleur (tappable)
3. Barre de recherche
4. Liste des entrées récentes (groupées)

## Comportements

- Le filtre couleur est exclusif (un seul actif à la fois).
- La recherche texte se combine avec le filtre couleur.
- Les groupes sont triés par `added_at` décroissant.
- Tap sur un groupe: ouvrir la première bouteille du groupe (v1), puis drill-down de groupe (v2).

## États

- Loading: spinner centré
- Error: message clair + action de retry
- Empty: illustration sobre + CTA “Ajouter une bouteille”

## Écran Encaver (`/add`)

## Rôle

Ajouter une ou plusieurs bouteilles avec un minimum d’effort.

## Étapes

1. Capture (caméra / galerie)
2. Extraction OCR
3. Confirmation/correction
4. Compléments (zone, étagère, quantité, prix)
5. Sauvegarde

## Principes UX

- Toujours permettre une saisie manuelle en fallback.
- Afficher les erreurs d’extraction sans bloquer la suite.
- En batch, exposer clairement la progression et les éléments en erreur.

## Écran Cheers! (`/remove`)

## Rôle

Scanner une bouteille pour la marquer comme bue et ajouter des notes de dégustation. Permet aussi de noter un vin goûté hors cave.

## Étapes (single)

1. Capture (caméra / galerie)
2. Extraction OCR
3. Matching sur bouteilles `in_stock`
4. Si match en cave : confirmation → passage en `drunk`
5. Si pas en cave : création d’une bouteille avec statut `drunk`
6. Transition vers la fiche dégustation

## Étapes (batch)

1. Sélection de plusieurs photos (jusqu’à 12)
2. Extraction IA en parallèle
3. Écran de revue avec badges : En cave / Hors cave / Non identifié
4. Sauvegarde groupée

## Principes UX

- Priorité au scan (action principale).
- Si ambiguïté, proposer une liste courte triée par pertinence.
- "Ce n’est pas cette bouteille" : formulaire de correction éditable puis re-matching.
- Après sortie, transition vers la fiche dégustation.
- En batch, exposer clairement la progression et les résultats par catégorie.

## Écran Détail bouteille (`/bottle/:id`)

## Rôle

Consulter et modifier la donnée de référence d’une bouteille. Sert aussi d’écran de dégustation après ouverture.

## Contenu

### Identity Card (toujours visible)
- Photo étiquette (zoomable)
- Domaine, cuvée, appellation, millésime, couleur
- Barre de détails : date, prix, emplacement

### Mode Cave (bouteille en stock)
- Section "Ma cave" : quantité, emplacement, date d’entrée, prix d’achat
- Section "Dégustations passées" : liste des bouteilles bues du même vin (même domaine + appellation + millésime), avec aperçu de la note
- CTA "Ouvrir cette bouteille" (passe en statut `drunk`)

### Mode Dégustation (bouteille bue)
- Photos de dégustation (bouchon, bouteille, autre) avec ajout par caméra ou galerie
- Tasting card intégrée :
  - Textarea libre ("Vos impressions sur ce vin...")
  - Rating sur 5 étoiles
  - Toggle "À racheter"
  - Rapport qualité/prix : Cher / Correct / Pépite
  - Boutons Enregistrer + Partager
- Mode batch : navigation prev/next entre plusieurs vins à déguster

## Actions

- Éditer (bouton crayon en header)
- Marquer sortie (si en stock)
- Enregistrer la dégustation (si bue)
- Partager la note (Web Share API)

## Écran Réglages (`/settings`)

## Rôle

Paramétrer la cave et gérer le compte.

## Contenu attendu

- Gestion des zones
- Préférences de scan
- État de session (compte, déconnexion)
- Infos version/app

## Ton UI

- Sobre, premium, lisible.
- Hiérarchie typographique nette.
- Feedback immédiat sur actions critiques (scan, save, sortie).

## Accessibilité et performance

- Cibles tactiles >= 44px
- Contrastes lisibles en environnement sombre (cave)
- Transitions courtes et utiles (pas d’animation décorative)
- Temps d’accès action principale <= 2 taps

## Métriques UX à suivre

- Temps moyen ajout bouteille
- Temps moyen sortie bouteille
- Taux d’extraction réussie sans correction
- Taux d’abandon du flux add/remove
- Nombre moyen de taps par action clé
