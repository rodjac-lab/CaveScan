# Backlog Celestin (ex-CaveScan)

Source unique de verite pour les travaux produit/tech.

---

## Fait

- [x] Securiser extract-wine (verify_jwt = true + prompt unifie)
- [x] Activer verify_jwt sur toutes les edge functions (extract-wine, celestin, enrich-wine)
- [x] Clarifier l'UX de la sortie (flow Cheers! single + batch)
- [x] Reduire la taille des pages monolithiques (refactoring Fowler : 13 composants, 3 utilities)
- [x] Suggestions intelligentes de bouteilles (module Decouvrir, Gemini Flash + Claude Haiku fallback)
- [x] Signature/partage "Partage avec CaveScan" (partage avec photos + branding)
- [x] Celestin V1 memoire : tasting tags, souvenirs proactifs, cross-session localStorage
- [x] Celestin UI : lisibilite (bulles retirees, 15px, espacement), persona plus tranchee, chips dynamiques LLM

---

## P0 — Maintenant

- [ ] Parcours de test manuel minimal avant release (auth, ajout, sortie, edition, notes, Celestin)
- [ ] Rebranding CaveScan -> Celestin (nom de code, repo, UI, logo, PWA manifest)

---

## P1 — Prochainement

### Cave & Gestion

- [ ] Historique d'achat par lots : enregistrements distincts par lot (date/prix/quantite/volume), prix moyen pondere en fiche, panneau "Historique des achats"
- [ ] Suppression/restauration controlee d'entrees/sorties (historique robuste)
- [ ] Fenetres de maturite : remplir drink_from/drink_until via enrichissement, alertes quand une bouteille arrive a maturite
- [ ] Import facture (photo/PDF) pour creation batch assistee, pipeline multi-lignes
- [ ] Import concurrent mobile-first : CellarTracker puis Vivino, reconnaissance automatique de formats

### OCR & Scan

- [ ] Ameliorer la qualite OCR sur cas difficiles (etiquettes inclinees, reflets, faible lumiere)

### Celestin — Qualite conversationnelle

- [ ] Intros de recommandation plus naturelles, moins ecrites et moins repetitives
- [ ] Durcir l'usage des souvenirs (ne citer que si lien vraiment evident)
- [ ] Relance conversationnelle quand contexte mets/vin incomplet, au lieu de sur-prescrire
- [ ] Encavage conversationnel : collecte infos manquantes par echange naturel avant fiche (prix, emplacement)
- [ ] Mieux exploiter la richesse des notes brutes et photos de plats (pas juste les tags resumes)
- [ ] Millesime comme champ explicite des cartes de recommandation
- [ ] Signal de style bouteille structure en remplacement du champ libre `character`

### Celestin — Engagement & Proactivite

- [ ] Message du jour a l'ouverture de l'app (maturite, meteo, suggestion contextuelle, rappel cave)
- [ ] Micro-rituels : "Ce soir" (17h-20h, 1 bouteille proposee), "Le debrief" (lendemain matin, pousser a noter), "Le dimanche" (resume hebdo)
- [ ] Debrief post-degustation : Celestin relance naturellement apres une notation
- [ ] Chips de bienvenue contextuels (selon heure, saison, etat de la cave) au lieu de statiques
- [ ] Micro-culture vin contextuelle ("Tu savais que Sancerre etait un vin rouge avant le phylloxera ?")

### Celestin — Profile V2

- [ ] Preferences de style (tendu vs ample, aerien vs dense, boise vs peu boise)
- [ ] Aversions et limites de gout
- [ ] Accords vecus et marquants (pas juste stats de cave)
- [ ] Contexte d'usage (semaine, diner, occasion, decouverte vs valeur sure)
- [ ] Confiance du signal pour eviter de surinterpreter des preferences faibles
- [ ] Preferences explicites dans Reglages (UI)

### Celestin — Memoire V2

- [ ] Migration cross-session localStorage -> Supabase
- [ ] Verification d'auth avancee dans le code des edge functions (decoder token, filtrer par user_id)

### Tech & Qualite

- [ ] Metriques produit de base (taux de scan reussi, temps moyen ajout/sortie)
- [ ] Outillage E2E minimal (Playwright, 3-5 parcours critiques)
- [x] Supprimer les edge functions obsoletes du repo (celestin-assistant/, recommend-wine/)
- [ ] Auth in-function sur celestin : verifier le JWT dans le code (remplace le toggle legacy dashboard qui ne fonctionne pas sur celestin)

---

## P2 — Plus tard

### Celestin — UX avancee

- [ ] Streaming word-by-word des reponses (effet typewriter, comme ChatGPT/Claude.ai)
- [ ] Animations d'entree des cartes (scale 0.95->1.0 + fade, 200ms)
- [ ] Sommelier score / gamification discrete (diversite, memoire, regularite)
- [ ] Bilans hebdo/mensuels ("En mars, tu as explore 3 nouvelles appellations")

### Celestin — Social & Decouverte

- [ ] Carte vin stylee exportable (image generee) pour partage 1-tap
- [ ] "Ce soir on est 6" : recommandation menu complet (apero -> dessert)
- [ ] "Mon ami aime le Bourgogne" : recommandations cadeau
- [ ] Decouverte de la semaine : 1 vin hors cave que Celestin pense que l'utilisateur aimerait
- [ ] Quand une bouteille est 5/5 : "Tu adores ce style. Voici 3 domaines similaires"

### Cave avancee

- [ ] Valorisation cave (prix marche) avec affichage de fiabilite
- [ ] Mode partage (lecture seule puis collaboration)
- [ ] Sortie vocale ("ouvre-moi un Margaux 2018")
- [ ] Reconnaissance bouteille vide
- [ ] RFID/NFC (si migration app native)

### Autres

- [ ] Rappels de fenetre de degustation (push ou email digest)
- [ ] Export assurance (PDF/CSV)

---

## References roadmap (PRD)

- MVP : entree/sortie photo, inventaire, recherche, sorties recentes, notes
- V1 : enrichissement prix/maturite, import factures
- V2 : reduction maximale de friction en sortie (voix, RFID)
