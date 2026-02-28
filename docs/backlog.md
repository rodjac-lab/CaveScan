# Backlog CaveScan

Liste vivante des travaux produit/tech, priorisée pour les prochaines itérations.

## Maintenant (P0)

- [ ] Sécuriser `extract-wine` : planifier le retour à `verify_jwt = true` et valider les flux caméra/galerie/batch.
- [ ] Ajouter un parcours de test manuel minimal avant release (auth, ajout, sortie, édition, notes).

## Prochainement (P1)

- [ ] Améliorer la qualité OCR sur cas difficiles (étiquettes inclinées, reflets, faible lumière).
- [ ] Ajouter des métriques produit de base (taux de scan réussi, temps moyen ajout/sortie).
- [ ] Ajouter suppression/restauration contrôlée d’entrées/sorties (historique robuste).
- [x] ~~Clarifier l’UX de la sortie~~ → Flow Cheers! (single + batch) en place.

## Plus tard (P2)

- [x] ~~Réduire la taille des pages monolithiques~~ → Refactoring Fowler complété : 13 composants extraits, 3 utilities centralisées (`bottleActions`, `uploadPhoto`, `wineMatching`).
- [x] ~~Suggestions intelligentes de bouteilles à ouvrir~~ → Le Sommelier (module Découvrir) avec Gemini Flash + Claude Haiku fallback.
- [ ] Valorisation cave (prix marché) avec affichage de fiabilité de la donnée.
- [ ] Import facture (photo/PDF) pour création batch assistée.
- [ ] Mode partage (lecture seule puis collaboration).

## Idées à explorer

- [x] ~~Signature/partage “Partagé avec CaveScan”~~ → Implémenté (partage avec photos + branding).
- [ ] Rappels de fenêtre de dégustation (push ou email digest).
- [ ] Export assurance (PDF/CSV).

## Références roadmap (PRD)

- MVP: entrée/sortie photo, inventaire, recherche, sorties récentes, notes.
- V1: enrichissement prix/maturité, import factures.
- V2: réduction maximale de friction en sortie (voix, RFID, etc.).
