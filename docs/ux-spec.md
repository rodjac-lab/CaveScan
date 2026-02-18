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
- `/add` : Entrée de bouteilles
- `/remove` : Sortie de bouteilles
- `/settings` : Réglages
- `/bottle/:id` : Détail bouteille
- `/bottle/:id/edit` : Édition bouteille

## Bottom nav (authentifié)

- Cave
- Entrée
- Ouvrir
- Réglages

Règles:

- Visible uniquement sur les routes authentifiées.
- Toujours accessible en bas de l’écran.
- Onglet actif visuellement explicite.

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

## Écran Entrée (`/add`)

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

## Écran Ouvrir (`/remove`)

## Rôle

Déclarer rapidement qu’une bouteille est sortie/ouverte.

## Étapes

1. Capture (caméra / galerie)
2. Extraction OCR
3. Matching sur bouteilles `in_stock`
4. Confirmation du match
5. Passage en `drunk`

## Principes UX

- Priorité au scan (action principale).
- Si ambiguïté, proposer une liste courte triée par pertinence.
- Si aucun match, proposer une sortie manuelle guidée.

## Écran Détail bouteille (`/bottle/:id`)

## Rôle

Consulter et modifier la donnée de référence d’une bouteille.

## Contenu

- Identité vin (domaine, cuvée, appellation, millésime, couleur)
- Localisation
- Photos (avant/arrière)
- Statut stock / sortie
- Note de dégustation

## Actions

- Éditer
- Marquer sortie (si en stock)
- Restaurer en stock (si sortie) - option contrôlée

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
