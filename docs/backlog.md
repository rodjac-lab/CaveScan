# Backlog CaveScan

Liste vivante des travaux produit/tech, priorisée pour les prochaines itérations.

## Maintenant (P0)

- [ ] Stabiliser le build sur environnements WSL/Linux (Rollup optional dependency).
- [ ] Sécuriser `extract-wine` : planifier le retour à `verify_jwt = true` et valider les flux caméra/galerie/batch.
- [ ] Ajouter un parcours de test manuel minimal avant release (auth, ajout, sortie, édition, notes).
- [ ] Réduire la taille des pages monolithiques (`AddBottle`, `RemoveBottle`, `BottlePage`) par extraction de sous-composants/hooks.

## Prochainement (P1)

- [ ] Améliorer la qualité OCR sur cas difficiles (étiquettes inclinées, reflets, faible lumière).
- [ ] Ajouter des métriques produit de base (taux de scan réussi, temps moyen ajout/sortie).
- [ ] Ajouter suppression/restauration contrôlée d’entrées/sorties (historique robuste).
- [ ] Clarifier l’UX de la sortie: scan d’abord vs recherche d’abord, puis normaliser le parcours.

## Plus tard (P2)

- [ ] Suggestions intelligentes de bouteilles à ouvrir (ancienneté, maturité, diversité).
- [ ] Valorisation cave (prix marché) avec affichage de fiabilité de la donnée.
- [ ] Import facture (photo/PDF) pour création batch assistée.
- [ ] Mode partage (lecture seule puis collaboration).

## Idées à explorer

- [ ] Signature/partage “Partagé avec CaveScan”.
- [ ] Rappels de fenêtre de dégustation (push ou email digest).
- [ ] Export assurance (PDF/CSV).

## Références roadmap (PRD)

- MVP: entrée/sortie photo, inventaire, recherche, sorties récentes, notes.
- V1: enrichissement prix/maturité, import factures.
- V2: réduction maximale de friction en sortie (voix, RFID, etc.).
