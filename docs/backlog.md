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
- [x] Chantier memoire Celestin taches #1-#2 : compilation par evenements + routeur SQL via classifier LLM, livre puis remplace par tools Claude (commits 52b07a7, 474747d, 5953bfc, aa2964c entre 2026-04-21 et 2026-04-23 ; remplacement 2026-05-01)
- [x] Celestin latence/architecture 2026-05-01 : classifier retire du chemin principal, appel unique edge function, Claude Haiku 4.5 primaire avec tools factuels internes (`query_cellar`, `query_tastings`, `query_memory`), traces provider/tools dans `/debug`

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

- [x] **Activer le filtre emplacement de la Cave**. Demande user beta : filtrer par emplacement pour distinguer plusieurs caves/maisons. V1 mobile-first : icone filtre integree a la recherche sur `/cave`, filtre rapide par emplacement uniquement, fermeture automatique du panneau apres selection, recherche texte pour domaine/appellation/cuvee/millesime, chip visible pour l'emplacement actif. Client-side, sans logique admin.
- [ ] Historique d'achat par lots : enregistrements distincts par lot (date/prix/quantite/volume), prix moyen pondere en fiche, panneau "Historique des achats"
- [ ] Suppression/restauration controlee d'entrees/sorties (historique robuste)
- [x] Fenetres de maturite : remplir drink_from/drink_until via enrichissement (fait), alertes quand une bouteille arrive a maturite (reste a faire)
- [ ] Import facture (photo/PDF) pour creation batch assistee, pipeline multi-lignes
- [ ] Import concurrent mobile-first : CellarTracker puis Vivino, reconnaissance automatique de formats. **Coupler avec un hook conversion** : "+1 mois de trial offert si tu importes ta cave Vivino". L'import = moment de wow puissant (50+ bouteilles d'un coup) + switching cost immédiat investi dans Celestin. Coût LLM marginal du bonus (~$0.13/user) trivial vs valeur d'un user enthusiaste qui apporte une cave constituée. Voir `docs/business_model_thinking.md` section "Hooks d'acquisition".

### OCR & Scan

- [ ] Ameliorer la qualite OCR sur cas difficiles (etiquettes inclinees, reflets, faible lumiere)
- [ ] **Extraction multi-bouteilles** (flag OFF, ENABLE_MULTI_BOTTLE_SCAN = false) — Tentative 2026-03-23 : prompt adaptatif (enrichissement leger si multi) + enrichissement async post-save via enrich-wine. Resultats : detection 6/6 OK mais qualite OCR mauvaise (noms de cuvee inventes, donnees incorrectes). Avant ca : detection 3-4/6 avec ancien prompt. Pistes : augmenter resolution image envoyee, tester prompt dedie multi (separe du single), envoyer chaque bouteille croppee individuellement, ou deux passes (detection zones puis OCR par zone). Code frontend pret (enrichWine.ts, AddBottle.tsx enrichissement fire-and-forget) mais flag reste OFF tant que la qualite n'est pas au rendez-vous. Piege deploy : ne pas oublier --no-verify-jwt au deploy de extract-wine.

### Celestin — Qualite conversationnelle

- [x] Phase 3 orchestrateur : prompt builder par cognitive mode + logs _debug (fait)
- [ ] **Dogfood V2 instrumente — revue courte avant refactor**. Pendant la phase dogfood personnel, utiliser `npm run dogfood:celestin` pour relire les sessions reelles avec traces (`capability`, `responseMode`, tools, fallback, latence, transcript). Sortie attendue : incidents classes (`routing`, `memory`, `recommendation`, `action`, `tone`, `latency`, `truth`), corrections ciblées seulement si bug produit clair, puis decision : dogfood elargi, refactor V2, ou V1 maintenue par defaut. Protocole : `docs/celestin-dogfood-protocol.md`.
- [ ] **Post-V2 — User Model / User Graph personnel**. Changement produit separe du chantier V2 runtime : representer durablement les preferences du user et des proches (`Marc n'aime pas les tanins`, `j'aime l'acidite sur les blancs`), distinguer `moi` / `proche` / `invites`, et eviter de contaminer une recommandation generique avec un contexte social ponctuel. A cadrer apres dogfood V2 : schema minimal de facts/personnes, hierarchie avec le profil compile, regles de prudence, scorecard dediee, outil de revision/oubli, et UX de transparence ("pour qui ?", "ce souvenir est-il vrai ?"). Ne pas l'inclure dans la stabilisation immediate V2 (`FACTS safety`, `ACTIONS contract`, scorecard ambiguite, decision dogfood).
- [ ] **Pairing Engine bidirectionnel — plat -> vin et vin -> plat**. Les amateurs demanderont autant "j'ai un plat, quel vin ?" que "j'ai envie d'un vin, quel plat ?" ; la seconde direction est plus pointue et ne doit pas etre traitee comme une recommandation cave avec cartes par defaut. Capitaliser sur les briques deja presentes (`food_pairings`, `tasting_tags.plats`, accords vecus dans le profil compile, ranking par pairing signals commits 7551de4/9215580) pour creer une capacite V2 explicite : `WINE_FOR_DISH` avec shortlist cave et cartes, `DISH_FOR_WINE` avec conseils de plats, souvenirs de degustation et references emotionnelles. Critere produit : apporter plus que ChatGPT generique en reliant les accords aux bouteilles, gouts et souvenirs reels du user. Scorecard dogfood a prevoir pour les deux sens.
- [ ] Intros de recommandation plus naturelles, moins ecrites et moins repetitives
- [ ] Durcir l'usage des souvenirs (ne citer que si lien vraiment evident)
- [ ] Relance conversationnelle quand contexte mets/vin incomplet, au lieu de sur-prescrire
- [x] Encavage conversationnel : collecte infos manquantes par echange naturel avant fiche (prix, emplacement)
- [x] Mieux exploiter la richesse des notes brutes et photos de plats (pas juste les tags resumes) — souvenirs de degustation (verbatim) injectes en wine_conversation + tasting_memory + cellar_assistant
- [x] Millesime comme champ explicite des cartes de recommandation
- [ ] Signal de style bouteille structure en remplacement du champ libre `character`

### Celestin — Cout & Latence

- [x] **Supprimer le classifier systematique du tour Celestin** (2026-05-01). `prep` revient a ~10ms, `classifierMs=0`, et les questions factuelles sont traitees dans l'appel principal par Claude + tools. Principe acte : pas de pre-tri LLM quand le LLM principal peut comprendre et agir.
- [x] **Prompt caching Anthropic V1 + observabilite debug** (2026-05-01). Les traces `/debug` exposent `cache_creation_input_tokens` et `cache_read_input_tokens`. A stabiliser avant scale : le cache depend d'un prefixe prompt stable, donc toute variation inutile du system/context casse le hit rate.
- [x] **Vague 1 single-shot LLM sur les recommandations** (2026-05-03). Pre-empt de `search_cellar_candidates` cote backend pour `recommendation_request`, `recommendation_refinement`, `memory_guided_recommendation`. Resultat mesure prod : 1 call Claude par tour reco au lieu de 2, cache_read 4198-4225 tokens, latence p50 -30 a -50%.
- [x] **Vague 2 deterministes etendus** (2026-05-03). `parseVolumeCellarBottleCount` (magnums, demi-bouteilles) et `parseCellarOriginLookup` (vin italien, espagnol, etc. avec polarite has/has_not). Tours `cellar_lookup` correspondants traites en 84-137ms sans LLM (`provider: deterministic`).
- [x] **Bonus prefetch single-shot** (2026-05-03). Route `prefetch` migree au pattern preempt. Code defensif : le frontend ne declenche pas le prefetch aujourd'hui, donc gain visible nul tant qu'on ne rebranche pas.

#### A faire — vague 3 et suite

- [ ] **Vague 3 cleanup tool-use mort dans `llm-providers.ts`** (~½ jour). Apres 1 semaine de prod stable sur vagues 1+2 et zero `provider_path: 'tool_response'` sur les routes preempted, supprimer le bloc round 2 de `callClaude` (lignes ~470-545), simplifier `source-mode.ts` (retirer `forced_tool` et `source_required` si plus utilises), retirer `usedRecommendationCandidateTool` de `recommendation-action.ts`. Cible : ~300-500 LOC en moins. Risque : ampute le filet de fallback rare ; valider via logs prod avant.
- [ ] **Decider du sort de la route `prefetch`**. Le frontend ne l'envoie pas (aucune occurrence de `__prefetch__` dans `src/`). Soit on rebranche cote frontend pour afficher 1-3 cartes au lancement du module Ce Soir (UX plus immediate), soit on supprime le code defensif backend (`prefetch` case dans `context-plan.ts`, branche dans `turn-interpreter.ts`, prompt branch dans `user-prompt.ts`). Si on rebranche, ajouter un order by `random()` ou `updated_at desc` dans `searchCellarCandidates` pour un sample frais.
- [ ] **Tuning persona "occasion familiale"**. Observation dogfood 2026-05-03 : sur "Que boire ce soir?", Claude projette systematiquement la femme et la fille (info venant du profil compile). Trop appuye. Soit ajouter une regle dans `persona.ts` ou `prompt-context-policy.ts` du genre "Ne projette pas d'occasion familiale si le tour courant ne la mentionne pas", soit attenuer le poids de la famille dans `compile-user-profile`.
- [ ] **Reseed l'eval LLM pour qu'elle soit authentifiee**. Aujourd'hui `evals/celestin-eval.test.ts` appelle la fonction avec `anon-key`, donc `auth.userId === null` cote backend. Resultat : le pre-empt cellar candidates ne fire jamais en eval, et la suite mesure le path anon (qui n'est plus le path prod). Recuperer un JWT du compte test (`rodolphe.jacson+test@gmail.com`, user_id `213e0662-2a6a-4868-957b-bbab982b342f`) et l'injecter dans le bearer du runner. Pre-requis : enrichir la cave et le profil compile du compte test pour matcher les scenarios eval (cave actuelle : 51 refs / 143 btl, profil compile vide).
- [ ] **Optim resolver : collapser le double scan `bottles`** (~30 min). Quand `cellarCandidates: 'preempted'`, `resolveCaveFromBackend` fait actuellement un count scan separement de `searchCellarCandidates` qui re-scan la table. Pour une cave 100+ bouteilles, c'est deux full scans sur le hot path. Reutiliser le resultat du candidate scan pour deriver `totalBottles`/`referenceCount` et eviter la 2eme query.
- [ ] **Memoize les parsers exact-query par tour** (~20 min). `parseFilteredCellarBottleCount`, `parseVolumeCellarBottleCount`, `parseCellarOriginLookup` sont aujourd'hui appeles 2× par tour (resolver puis deterministic-response). Cheap individuellement mais 6 regex passes pour la meme string. Parser une fois en amont (turn-interpreter ou un memo `WeakMap` sur `body`) et passer le resultat.
- [ ] **Stabiliser le hit rate du cache Anthropic**. Objectif : verifier sur 24h que les sessions multi-tour lisent le cache apres le premier tour. Ajouter un indicateur agrege si besoin (`events` ou debug export) et reduire les variations du prefixe cacheable.
- [ ] **Bloquer ou encadrer les fallbacks non-tooles sur questions exactes**. Gemini/OpenAI n'ont pas les tools internes ; ils peuvent depanner une conversation, mais ne doivent pas inventer un count cave/degustation si Claude/tool-use echoue.
- [ ] **Priorite haute post-stabilisation V2 — Runtime tools provider-agnostic**. Dette architecture : les tools factuels Celestin (`query_cellar`, `query_tastings`, `query_memory`, `search_cellar_candidates`) sont aujourd'hui branches sur le chemin Claude. Objectif : sortir l'execution des tools du provider, definir un contrat commun de tool-call, puis ajouter des adapters Claude/OpenAI/Gemini autour de ce contrat. Tant que ce chantier n'est pas fait, les fallbacks non-tooles restent bloques sur faits exacts. Regle de securite : ne pas casser la V2 stabilisee ; garder le chemin Claude actuel comme reference tant que le runtime commun n'a pas passe scorecard V2 auth + dogfood compare + tests source-required. Sortie attendue : OpenAI/Gemini peuvent reprendre un tour FACTS/source_required avec les memes donnees que Claude, et les comparaisons provider deviennent honnetes.
- [ ] **Streaming des reponses Claude**. Objectif perception : afficher les premiers tokens pendant que le modele genere, sans changer l'architecture factuelle.

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
2. [x] **Routeur SQL pour questions factuelles — livré puis retiré** (commits 474747d + 5953bfc + aa2964c, 2026-04-22/23). La premiere version regex puis le classifier LLM dedie ont ete abandonnes apres faux positifs systemiques. Le 2026-05-01, ce chemin a ete retire du runtime principal : Claude Haiku 4.5 choisit lui-même les tools factuels user-scopes dans l'appel principal. Le code legacy/debug a ete supprime le 2026-05-03.
3. [x] **Enrichissement de la memoire pre-compilee** (2026-04-24). Constat en lisant le code : seules 3 des 7 categories de `user_memory_facts` (`preference`, `aversion`, `wine_knowledge`) etaient compilees dans le Markdown injecte a Celestin ; `context`, `life_event`, `social`, `cellar_intent` etaient extraites et stockees mais jamais injectees. Fix : refonte de `buildCompiledProfileMarkdown` avec scoring `confidence × decay recence` par categorie (demi-vies 30j-540j), seuils de confiance minimum par categorie (0.5-0.7), quotas adaptes, et 2 nouvelles sections `## Entourage et partages` (social) + `## Contexte et intentions` (context + cellar_intent). Les `context` temporaires non expires sont prefixes `[contexte recent]`. Notes de degustation passent de 180 a 400 caracteres. Option A (selection runtime query-aware des facts bruts) explicitement ecartee en faveur de l'enrichissement compile-time, aligne sur la doctrine "complexite dans la compilation, pas au runtime".
4. [x] **Filtrage deterministe a la compilation + funnel envies/decouvertes/piliers** (2026-04-25). Au lieu de durcir le prompt `extract-chat-insights` (option fragile : le LLM ignore les regles), choix archi de garder la DB comme bac brut et de filtrer/recategoriser a la compilation (cohérent avec la doctrine "complexite dans la compilation"). Couche `sanitizeFacts` dans `compiled-profile.ts` : skip des `cellar_intent` qui sont des observations d'inventaire (regex sur "n'a aucun", "possede X", "dans sa cave"), skip des `wine_knowledge` qui sont du feedback produit ("Celestin", "l'app", "s'attend a ce que") ou des questions ponctuelles ("se demande", "s'interesse aux differences"). En complement, `classifyPreferences` repartit les facts `preference` en 3 buckets selon evidence (croisement avec `topTastings`, `topDomaines`, autres facts) et detection de verbes futur/conditionnel : `## Profil gustatif` (piliers durables, evidence ≥ 2), `## Decouvertes a confirmer` (1 mention), `## Envies` (verbe au futur "aimerait essayer", "veut gouter"). Modele du parcours utilisateur : envie → decouverte → pilier. Validation dogfood : profil V13 propre, les 4 facts bruites identifies disparus, Prieure Roch et Dandelion descendus en decouvertes, Macle reste pilier.
5. [~] **Feedback loop retrieval — déprioritisé YAGNI (2026-04-26)**. Capter les reactions negatives du user a un souvenir cite ("non pas ca", "ce vin je l'ai deteste") et baisser le score de ce souvenir. Estimation 7-9h, modifie 4-5 surfaces critiques (turn interpreter, prompt Celestin, DB, compilation), risque de regression moyen-eleve. Gain estime +1 point sur 10. Ratio effort/risque/gain juge insuffisant : la couche T3 + le funnel deja livres rendent la mémoire propre, donc le besoin de correction runtime devient rare. Decision Rodol : ne pas faire un dev qui beneficie surtout au dogfood perso ; attendre un concept plus elegant si le besoin se manifeste cote users finaux. Une version dégradée (bouton "marquer comme faux" dans /debug) a aussi ete écartée pour la même raison.
6. [x] **Hygiène mémoire — résolue rétroactivement (2026-04-26)**. Audit a posteriori : (a) `useRecentlyDrunk` utilise `CELESTIN_TASTING_MEMORY_LIMIT = 300` depuis un commit anterieur, le `limit(30)` mentionne dans le backlog n'existe plus dans le hook ; le seul `.limit(30)` restant est dans `compile-user-profile/index.ts:95` pour les `topTastings`, plafond volontaire. (b) Auth in-function deja en place sur les 3 edge functions qui touchent la DB de maniere sensible (`compile-user-profile`, `patch-user-profile`, `import-vivino-label`) via `getAuthenticatedUserId` qui decode le JWT et utilise l'`auth.user.id` dans tous les `.eq('user_id', userId)`. Les autres edge functions (`celestin`, `extract-chat-insights`, `extract-wine`, `generate-embedding`, etc.) ne touchent pas la DB cote server, l'auth in-function n'y apporte rien.
7. [x] **Dedupe fuzzy des facts compiles** (2026-04-25). `normalizeDedupKey` extrait dans `compiled-profile.ts`, utilisé par `pickTopFacts` et `classifyPreferences`. Strip de la ponctuation finale et des adverbes temporels de fin (actuellement, désormais, aujourd'hui, en ce moment, pour le moment, ces derniers temps, depuis peu, récemment, maintenant). Boucle while pour cumuler les strips successifs. Validation V14 : doublon Macle disparu.
8. [x] **Matching d'entité plus fin** (2026-04-25). `tokenizeForMatching` + `entityMatchesHaystack` dans `compiled-profile.ts`. Tokenization avec strip diacritiques et `TOKEN_STOP_WORDS` (articles, prépositions, mots génériques type "domaine", "château", "vin"). Seuil token-overlap : 1 si l'entité fait 1 token, 2 sinon. Couvre les entités longues qui dépassent le haystack ("Aloxe-Corton Domaine Céline Perrin 2022" matche `domaine: "Domaine Céline Perrin"`). Robuste aux différences d'accentuation. Validation V14 : Aloxe-Corton remonté en pilier.
9. [ ] **Outil de nettoyage de la mémoire perso**. Le compte personnel de Rodol contient des facts qui viennent de sessions de test (ex : "L'utilisateur a acheté un Sancerre 2023 du Domaine Vacheron" issu du dogfood du 2026-04-04, alors qu'aucun achat réel n'a eu lieu). L'extraction était correcte vu le contexte conversationnel ("j'ai acheté du vin aujourd'hui" → "Un Sancerre 2023..."), donc pas un bug d'archi. Besoin d'un outil pour identifier et nettoyer ces facts a posteriori. Pistes : panel `/debug` listant les facts avec source_quote + session_id + date + bouton "supprimer" ; ou heuristique pour marquer `is_test_session=true` quand le contexte le suggère (présence de tournures dogfood) ; ou simple liste des `session_id` connus comme tests à nuker. La séparation préventive (tester sur compte test, pas compte perso — déjà actée en mémoire `feedback_dogfood_account`) est la première ligne de défense ; cet outil est la deuxième pour les sessions passées.

#### Dette technique Celestin (audit 2026-04-22)

Identifie pendant le nettoyage SQL routing. Les quick wins sont deja livres (commit aa2964c). Reste :

- [x] **Alleger le prompt anti-hallucination** dans `supabase/functions/celestin/context-builder.ts` (2026-04-26). Reduction ~120 tokens sur les modes cellar_assistant/tasting_memory/wine_conversation pendant la phase routeur SQL. Le contrat SQL legacy a ensuite ete supprime le 2026-05-03 ; les faits exacts passent par les tools backend. Detail historique dans `docs/archive/celestin-prompt-audit-2026-04.md`.
- [x] **Consolider les detecteurs de follow-up memoire** : patterns partages dans `shared/celestin/memory-intent-patterns.ts`, consommes par `memory-focus.ts`, `turn-signals.ts` et `tastingMemoryFilters.ts`. Tests routing/memoire ajoutes pour eviter les derives `cellar_lookup` / `tasting_log` vers `memory_lookup`.
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
- [ ] Idee produit plus tard : recommandations a plusieurs niveaux d'audace. Exemple : donner d'abord l'accord classique fiable (Riesling/Chablis/Champagne sur sushi), puis proposer une option aventureuse si cela a du sens ("si tu veux tenter autre chose, un rose ou rouge tres leger"). Hors chantier refacto routing/prompt actuel.
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
