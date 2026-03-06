# Backlog CaveScan

Liste vivante des travaux produit/tech, priorisÃ©e pour les prochaines itÃ©rations.

## Maintenant (P0)

- [ ] SÃ©curiser `extract-wine` : planifier le retour Ã  `verify_jwt = true` et valider les flux camÃ©ra/galerie/batch.
- [ ] Ajouter un parcours de test manuel minimal avant release (auth, ajout, sortie, Ã©dition, notes).

## Prochainement (P1)

- [ ] AmÃ©liorer la qualitÃ© OCR sur cas difficiles (Ã©tiquettes inclinÃ©es, reflets, faible lumiÃ¨re).
- [ ] Ajouter des mÃ©triques produit de base (taux de scan rÃ©ussi, temps moyen ajout/sortie).
- [ ] Ajouter suppression/restauration contrÃ´lÃ©e dâ€™entrÃ©es/sorties (historique robuste).
- [ ] Historique d'achat par lots: conserver des enregistrements distincts pour un meme vin (date/prix/quantite/volume) tout en affichant une quantite agregee juste dans la cave. Probleme actuel: en vue detail d'une ligne agregee, un seul lot est visible donc les autres prix d'achat sont invisibles. Proposition UX: Fiche -> prix moyen pondere (par quantite) -> tap pour ouvrir un panneau "Historique des achats" listant tous les lots.
- [ ] Celestin: rendre les intros de recommandation plus naturelles, moins ecrites et moins repetitives.
- [ ] Celestin: durcir l'usage des souvenirs. Ne citer une memoire que si le lien est vraiment evident et non artificiel.
- [ ] Celestin: permettre une relance conversationnelle simple quand le contexte mets/vin n'est pas assez clair, au lieu de sur-prescrire.
- [ ] Recommendations: ajouter le millesime comme champ explicite des cartes pour eviter qu'il disparaisse selon la formulation du modele.
- [ ] Recommendations: definir plus tard un signal de style bouteille structure et fiable en remplacement du champ libre `character`.
- [x] ~~Clarifier lâ€™UX de la sortie~~ â†’ Flow Cheers! (single + batch) en place.

## Plus tard (P2)

- [x] ~~RÃ©duire la taille des pages monolithiques~~ â†’ Refactoring Fowler complÃ©tÃ© : 13 composants extraits, 3 utilities centralisÃ©es (`bottleActions`, `uploadPhoto`, `wineMatching`).
- [x] ~~Suggestions intelligentes de bouteilles Ã  ouvrir~~ â†’ Le Sommelier (module DÃ©couvrir) avec Gemini Flash + Claude Haiku fallback.
- [ ] Valorisation cave (prix marchÃ©) avec affichage de fiabilitÃ© de la donnÃ©e.
- [ ] Import facture (photo/PDF) pour crÃ©ation batch assistÃ©e.
- [ ] Mode partage (lecture seule puis collaboration).

## IdÃ©es Ã  explorer

- [x] ~~Signature/partage â€œPartagÃ© avec CaveScanâ€~~ â†’ ImplÃ©mentÃ© (partage avec photos + branding).
- [ ] Rappels de fenÃªtre de dÃ©gustation (push ou email digest).
- [ ] Export assurance (PDF/CSV).

## RÃ©fÃ©rences roadmap (PRD)

- MVP: entrÃ©e/sortie photo, inventaire, recherche, sorties rÃ©centes, notes.
- V1: enrichissement prix/maturitÃ©, import factures.
- V2: rÃ©duction maximale de friction en sortie (voix, RFID, etc.).

