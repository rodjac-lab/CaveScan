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
- `/remove` : Sortie de bouteilles (extraction + marquage drunk)
- `/degustations` : Historique des dégustations
- `/decouvrir` : Découvrir (Celestin — le sommelier IA)
- `/settings` : Réglages
- `/bottle/:id` : Détail bouteille
- `/bottle/:id/edit` : Édition bouteille
- `/debug` : Debug (dev only)

## Bottom nav (authentifié) — 5 onglets

- Cave (`/cave`) — House icon
- Dégustations (`/degustations`) — Calendar icon
- [Scanner] (`/scanner`) — bouton central surélevé, gradient doré 52px
- Celestin (`/decouvrir`) — Smirk face icon
- Réglages (`/settings`) — Gear icon

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

## Écran Sortie bouteille (`/remove`)

> **Note :** La page d'historique des dégustations est accessible à `/degustations` (onglet "Dégustations" de la bottom nav). L'écran ci-dessous concerne le flow de sortie de bouteille déclenché par le scanner.

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
  - Rating demi-étoiles (0.5 à 5 par incréments de 0.5, tap gauche = demi-étoile, tap droite = étoile pleine, affichage clip CSS)
  - Toggle "À racheter"
  - Rapport qualité/prix : Cher / Correct / Pépite
  - Boutons Enregistrer + Partager
- Mode batch : navigation prev/next entre plusieurs vins à déguster

## Actions

- Éditer (bouton crayon en header)
- Marquer sortie (si en stock)
- Enregistrer la dégustation (si bue)
- Partager la note (Web Share API + partage unifié avec photos via `shareWine.ts`)

## Écran Réglages (`/settings`)

## Rôle

Paramétrer la cave et gérer le compte.

## Contenu attendu

- Gestion des zones
- Préférences de scan
- État de session (compte, déconnexion)
- Infos version/app

## Questionnaire inline

### Rôle

Questionnaire FWI (Food-Wine Interaction) + préférences sensorielles, intégré dans CeSoirModule. Proposé à l'ouverture si l'utilisateur n'a pas encore complété son profil.

### Déclenchement

- Automatique : à l'ouverture de `/decouvrir` si aucun profil questionnaire n'existe
- Manuel : regex `/(?:profil|questionnaire|mieux.*conna[iî]tre|d[ée]couvrir.*profil)/i` détectée dans le message

### Chips d'activation

- "Allons-y !"
- "Découvrir mon profil"
- "Pas maintenant"

### Résultat

Profil marketing + scores sensoriels sérialisés et injectés dans le contexte Celestin via `serializeQuestionnaireForPrompt()`.

---

## Flow Celestin (`/decouvrir`)

### Greeting contextuel

Message handcrafted (pas de LLM) basé sur :
- **Tranche horaire** : matin (<11h), midi (<14h), après-midi (<17h), apéro (<20h), soir (≥20h)
- **Jour** : semaine, vendredi, weekend
- **Saison** : printemps (fév-avr), été (mai-jul), automne (aoû-oct), hiver

10 variantes distinctes. Exemple : vendredi soir été → suggestion apéro en terrasse.

### Welcome chips contextuels

3 chips adaptés à l'heure :
- **Matin** (<11h) : "Accord mets & vin", "Ajouter une bouteille", "Parle-moi d'un cépage"
- **Midi** (<14h) : "Accord pour ce midi", "Que boire avec mon plat ?", "Ajouter une bouteille"
- **Après-midi** (<17h) : "Préparer le dîner", "Ajouter une bouteille", "Accord mets & vin"
- **Soir vendredi/weekend** : "Que boire ce soir ?", "Accord mets & vin", "Ouvrir une bouteille"
- **Soir semaine** : "Que boire ce soir ?", "Accord mets & vin", "Ajouter une bouteille"

### 3 flows photo

1. **Encavage** : regex `/encav|ajoute|stock|range|met.*cave/i` + photo → `extractWineFromFile()` → WineActionCard inline
2. **Multimodal** : texte + photo → `callCelestin(text, image)` → Celestin vision (orchestration complète)
3. **Photo-only** : photo sans texte → chips de clarification ("Encaver", "Conseille-moi", "Carte des vins")

### State machine

État persisté en module-level (`persistedConversationState`), envoyé à chaque requête, mis à jour depuis `_nextState` de la réponse.

### Mémoire

- `selectRelevantMemoriesAsync()` : try semantic search (pgvector) → fallback keyword matching
- Cross-session : localStorage TTL 7j, max 4 sessions, rotation automatique

### Encavage conversationnel

Collecte progressive domaine → prix → zone via Celestin (mode `cellar_assistant`, `collecting_info`).

### Sommelier au resto

Photo carte des vins → routing `restaurant_assistant` → recommandation depuis la carte uniquement.

### Chips dynamiques LLM

`action_chips` dans chaque réponse, 2-3 suggestions contextuelles générées par le LLM.

### UI actions

- `show_recommendations` : cartes carousel de bouteilles recommandées
- `prepare_add_wine` : WineActionCard inline (valider/modifier)
- `prepare_add_wines` : navigation vers `/add` en mode batch
- `prepare_log_tasting` : fiche dégustation inline

---

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
