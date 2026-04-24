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
- [x] Celestin orchestrateur Phase 1 : response policy post-LLM, context levels (minimal/light/full), intent classifier context-aware, nettoyage images historique
- [x] Celestin orchestrateur Phase 2 : state machine 6 etats, Turn Interpreter (remplace classifyIntent), 4 cognitive modes, state frontend persistent
- [x] Celestin orchestrateur Phase 3 : prompt builder par cognitive mode, _debug dans la reponse API, eval multi-tours (11 conversations)
- [x] Chantier memoire Celestin taches #1-#2 : compilation par evenements + routeur SQL via classifier LLM (commits 52b07a7, 474747d, 5953bfc, aa2964c entre 2026-04-21 et 2026-04-23)

---

## P0 — Avant lancement

- [ ] Rebranding : nettoyer les dernieres references CaveScan (PWA manifest, package.json, localStorage keys, docs)
- [ ] Auth in-function sur TOUTES les edge functions (celestin, extract-wine, enrich-wine, extract-tasting-tags)
- [ ] RGPD : page mentions legales/CGU + bouton suppression de compte dans Reglages
- [ ] Suivi couts LLM : compteur d'appels par user/jour dans la table events
- [ ] Limiter historique Celestin envoye au LLM (cap tokens) + longueur max des messages utilisateur
- [ ] Parcours de test manuel minimal avant release (auth, ajout, sortie, edition, notes, Celestin)

---

## P1 — Prochainement

### Cave & Gestion

- [ ] Historique d'achat par lots : enregistrements distincts par lot (date/prix/quantite/volume), prix moyen pondere en fiche, panneau "Historique des achats"
- [ ] Suppression/restauration controlee d'entrees/sorties (historique robuste)
- [x] Fenetres de maturite : remplir drink_from/drink_until via enrichissement (fait), alertes quand une bouteille arrive a maturite (reste a faire)
- [ ] Import facture (photo/PDF) pour creation batch assistee, pipeline multi-lignes
- [ ] Import concurrent mobile-first : CellarTracker puis Vivino, reconnaissance automatique de formats

### OCR & Scan

- [ ] Ameliorer la qualite OCR sur cas difficiles (etiquettes inclinees, reflets, faible lumiere)
- [ ] **Extraction multi-bouteilles** (flag OFF, ENABLE_MULTI_BOTTLE_SCAN = false) — Tentative 2026-03-23 : prompt adaptatif (enrichissement leger si multi) + enrichissement async post-save via enrich-wine. Resultats : detection 6/6 OK mais qualite OCR mauvaise (noms de cuvee inventes, donnees incorrectes). Avant ca : detection 3-4/6 avec ancien prompt. Pistes : augmenter resolution image envoyee, tester prompt dedie multi (separe du single), envoyer chaque bouteille croppee individuellement, ou deux passes (detection zones puis OCR par zone). Code frontend pret (enrichWine.ts, AddBottle.tsx enrichissement fire-and-forget) mais flag reste OFF tant que la qualite n'est pas au rendez-vous. Piege deploy : ne pas oublier --no-verify-jwt au deploy de extract-wine.

### Celestin — Qualite conversationnelle

- [x] Phase 3 orchestrateur : prompt builder par cognitive mode + logs _debug (fait)
- [ ] Intros de recommandation plus naturelles, moins ecrites et moins repetitives
- [ ] Durcir l'usage des souvenirs (ne citer que si lien vraiment evident)
- [ ] Relance conversationnelle quand contexte mets/vin incomplet, au lieu de sur-prescrire
- [x] Encavage conversationnel : collecte infos manquantes par echange naturel avant fiche (prix, emplacement)
- [x] Mieux exploiter la richesse des notes brutes et photos de plats (pas juste les tags resumes) — souvenirs de degustation (verbatim) injectes en wine_conversation + tasting_memory + cellar_assistant
- [x] Millesime comme champ explicite des cartes de recommandation
- [ ] Signal de style bouteille structure en remplacement du champ libre `character`

### Celestin — Sommelier au resto

- [x] Photo de la carte des vins → OCR → Celestin recommande en fonction du plat et du profil utilisateur
- [x] Mode "hors cave" : recommandation parmi des vins que l'utilisateur n'a pas en cave (carte resto, caviste)
- [x] Cognitive mode `restaurant_assistant` : turn interpreter, prompt builder sans cave, rules carte
- [ ] Extraction structuree carte des vins (prix, format liste) — ameliorer extract-wine pour le format ardoise/carte
- [ ] Flow multi-tour guide : photo carte → user dit son plat → Celestin choisit et explique pourquoi (persistence contexte resto)

### Celestin — Engagement & Proactivite

- [ ] Message du jour a l'ouverture de l'app (maturite, meteo, suggestion contextuelle, rappel cave)
- [ ] Micro-rituels : "Ce soir" (17h-20h, 1 bouteille proposee), "Le debrief" (lendemain matin, pousser a noter), "Le dimanche" (resume hebdo)
- [ ] Debrief post-degustation : Celestin relance naturellement apres une notation
- [ ] Chips de bienvenue contextuels (selon heure, saison, etat de la cave) au lieu de statiques
- [ ] Micro-culture vin contextuelle ("Tu savais que Sancerre etait un vin rouge avant le phylloxera ?")

### Celestin — Exploitation du profil questionnaire

- [ ] Adapter le ton/niveau de langage de Celestin selon le segment (enthusiast = terroir/millesimes, bon vivant = simple et direct)
- [ ] Ponderer les recommandations selon le profil (haut Terroir = appellations precises, haut Sensibilite = conseils carafage/temperature)
- [ ] Pousser decouverte aux explorateurs, valeurs sures aux classiques
- [ ] Onboarding personnalise post-questionnaire ("Scanne tes 5 preferees" vs "Scanne tout, on fera le tri")
- [ ] Page profil visible dans Reglages (ProfileCard + bouton refaire le questionnaire)
- [ ] Partage social du profil ("Je suis L'Explorateur Curieux sur Celestin") — viralite
- [ ] Segmentation pricing : enthusiasts = cible premium naturelle (cave plus grosse/chere)
- [ ] Analytics profils : distribution des segments pour orienter le produit
- [ ] Evolution du profil : inciter a refaire le questionnaire apres 6 mois ("Tu as peut-etre progresse")
- [ ] Questionnaire comme outil d'acquisition : "Decouvre ton profil vin gratuitement" (feature free tier, partageable, virale)
- [ ] Conclusion personnalisee par profil qui pousse vers l'app (ex: Classique Exigeant → "Celestin t'aidera a ouvrir tes plus belles bouteilles au meilleur moment", Bon Vivant → "Celestin t'aidera a trouver les meilleurs accords", Explorateur → "Celestin te fera decouvrir des pepites que tu n'aurais jamais trouvees seul")
- [ ] Version standalone du questionnaire (landing page dediee, sans inscription) → capture email + conversion vers l'app

### Celestin — Profile V2

- [ ] Preferences de style (tendu vs ample, aerien vs dense, boise vs peu boise)
- [ ] Aversions et limites de gout
- [ ] Accords vecus et marquants (pas juste stats de cave)
- [ ] Contexte d'usage (semaine, diner, occasion, decouverte vs valeur sure)
- [ ] Confiance du signal pour eviter de surinterpreter des preferences faibles
- [ ] Preferences explicites dans Reglages (UI)

### Celestin — Memoire V2

- [x] **Semantic search via embeddings/pgvector** — pgvector + colonne embedding vector(1536) sur bottles, edge function generate-embedding (OpenAI text-embedding-3-small), RPC search_memories (score hybride cosine 0.6 + qualite 0.4), selectRelevantMemoriesAsync avec fallback keyword matching. Backfill fait (44 bouteilles).
- [x] **Migration cross-session localStorage -> Supabase** — tables chat_sessions + chat_messages, fire-and-forget, fallback localStorage offline
- [x] **Extraction d'insights conversationnels** — edge function extract-chat-insights (Gemini Flash → Claude Haiku), table user_memory_facts avec categories/supersedure/expiration, declenchement tous les 4 messages user
- [x] **Injection memoire universelle** — memory facts injectes dans TOUS les cognitive modes (corrige le manque en wine_conversation/restaurant_assistant)
- [x] **Retrieval de conversations completes** — regex detection + semantic search sur session summaries + chargement messages complets

#### Chantier memoire — 5 taches pour finir

Ordre de priorite (du plus structurel au plus hygienique).

1. [x] **Compilation par evenements** (doctrine `celestin-memory-compilation-events.md`, commit 52b07a7 du 2026-04-21). Cycle de vie en place : detection de `candidate_signals` pendant la session, check leger fin de session (no_change ou patch add/edit/remove), reecriture complete periodique (~20 patchs ou ~1/mois) pour compacter. Valide en prod.
2. [x] **Routeur SQL pour questions factuelles** (commits 474747d + 5953bfc + aa2964c, 2026-04-22/23, doc `docs/celestin-sql-routing-refactor.md`). Classifier LLM dedie (`classify-celestin-intent`, Gemini Flash Lite) + 5 builders deterministes dans `sqlRetrievalRouter.ts`. La premiere version regex a ete abandonnee apres decouverte de faux positifs systemiques (mars/Marsannay, laval/Val de Loire, Saint/Saint-*, rôti/Côte Rôtie). Net : -809 lignes. Questions factuelles ~3-3.5s total, triviaux ~2s.
3. [ ] **Ranking contextuel des `user_memory_facts`**. Aujourd'hui les 40 derniers facts non-supersedes sont injectes en vrac quel que soit le tour. Filtrer/ponderer par pertinence au message en cours (categorie, recence, match semantique leger).
4. [ ] **Feedback loop retrieval**. Capter les reactions negatives du user a un souvenir cite ("non pas ca", "ce vin je l'ai deteste") et baisser le score de ce souvenir pour les tours suivants — ou au minimum le marquer.
5. [ ] **Hygiene mémoire**. `useRecentlyDrunk limit(30)` (plafond silencieux a remonter/supprimer) + auth in-function avancee sur edge functions (decoder token, filtrer par `user_id` en plus du RLS).

#### Dette technique Celestin (audit 2026-04-22)

Identifie pendant le nettoyage SQL routing. Les quick wins sont deja livres (commit aa2964c). Reste :

- [ ] **Alleger le prompt anti-hallucination** dans `supabase/functions/celestin/context-builder.ts`. ~350 tokens de regles defensives empilees qui conflictent avec la persona "3-5 lignes". Maintenant que le bloc SQL est garanti propre par le classifier, on peut reduire. Demande cycle de re-test + eval harness.
- [ ] **Consolider les detecteurs de follow-up memoire** : 3 sets de patterns quasi-identiques dans `memory-focus.ts:16`, `turn-signals.ts:115` et `tastingMemoryFilters.ts:39`. Divergences subtiles, risque de bug de routing. Consolider dans `shared/celestin/memory-intent-patterns.ts`.
- [ ] **`tastingMemoryFilters.ts`** (476 lignes) a 3 responsabilites melangees (normalize + extract + classify). A scinder en `normalization.ts` / `exactFilters.ts` / `evidenceMode.ts` lors du prochain passage sur la memoire.
- [ ] **`user-prompt.ts`** : 12 branches if/else en cascade. State machine de directives a materialiser comme table de dispatch.
- [ ] **6 sets de mots-bruits** (STOP_WORDS, CONTEXTLESS_TERMS, TEMPORAL_NOISE_TERMS, TOPONYM_NOISE_TERMS, FOCUS_STOP_WORDS, GENERIC_FOCUS_WORDS) avec overlaps non testes. Consolider dans `shared/celestin/wine-vocabulary.ts`.
- [ ] **Unifier les patterns de recommandation** client (`celestinChatRequest.ts:16`) et serveur (`turn-signals.ts:32`). Les deux patterns couvrent des choses differentes (client = mots-plats, serveur = verbes/meta-phrases). Refactor dedie requis.
- [ ] **`crossSessionMemory.ts`** (152 lignes) : plus consomme par le runtime prompt, seulement par /debug. A migrer dans un module debug.

### Tech & Qualite

- [ ] Metriques produit de base (taux de scan reussi, temps moyen ajout/sortie)
- [ ] Outillage E2E minimal (Playwright, 3-5 parcours critiques)
- [x] Supprimer les edge functions obsoletes du repo (celestin-assistant/, recommend-wine/)
- [x] Auth in-function sur celestin — deplace en P0
- [ ] Validation taille/format sur upload photo (limite MB + type MIME)
- [ ] Detection doublons a l'encavage (meme domaine + appellation + millesime = alerte)
- [ ] Dashboard couts LLM basique (nb appels/user, cout estime)

### Business & GTM

- [ ] Modele freemium : definir les limites (X questions Celestin/mois, cave illimitee)
- [ ] Integration Stripe (paiement)
- [ ] Landing page repositionnee "Sommelier IA personnel" (pas "gestionnaire de cave")
- [ ] Onboarding : premier contact = Celestin, pas le scan
- [ ] Strategie acquisition premiers 50 utilisateurs (canaux, communautes vin, beta privee)
- [ ] KPIs de lancement (retention J7/J30, cout LLM/user, taux de conversion free→paid)

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
