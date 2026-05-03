# Plan refonte Celestin - Routage, contexte, sources

## Objectif

Ameliorer Celestin structurellement sans empiler une couche de plus.

Le but n'est pas seulement d'ajouter un `ContextPlan`. Le but est de clarifier les responsabilites :

- routage fiable ;
- regles explicites ;
- sources optimisees ;
- moins de contexte envoye "au cas ou" ;
- meilleure qualite conversationnelle ;
- cout et latence plus predecibles.

Architecture cible :

```text
RequestBody minimal
-> TurnInterpreter
-> ContextPlan
-> SourceResolver
-> PromptAssembler
-> ProviderAdapter
```

## Etat au 2026-05-02 soir

Le chantier a avance au-dela du plan initial, mais il reste dans une zone hybride.
Ce document doit servir de reprise demain sans refaire le diagnostic.

### Fait et commite

- `TurnInterpreter` stabilise par tests : social acknowledgements, refinements de
  recommandation reconstruits depuis l'historique, et nouvelles demandes de
  recommandation pendant `collecting_info`.
- `ContextPlan` existe et decide le niveau de profil, cave, zones, memoires,
  tools, historique et truth policy par route.
- `SourceResolver` existe et recupere cote backend :
  - profil compile ;
  - cave count / shortlist / tool-only ;
  - zones ;
  - souvenirs cibles ou exacts ;
  - degustations exactes pour certains chemins.
- `PromptAssembler` existe et assemble system prompt, politique du tour, contexte
  resolu, user prompt et provider history.
- Observabilite en base : route, mode, plan, sources resolues, tools, tokens,
  phases state machine, latences edge/frontend.
- La fonction Supabase `celestin` a ete redeployee apres les commits suivants :
  - `4c0cf5e Fix Celestin social ack routing`
  - `607e2ba Ensure Celestin recommendation cards are emitted`
  - `2788156 Match Celestin cards to recommended wines`

### Diagnostic important

Sur les recommandations, le routage et les sources peuvent etre corrects tout en
ayant `ui_action=none`.

Cas observe :

- `Je cherche un vin pour accompagner une paella`
- route : `recommendation_request`
- cave shortlist : presente
- tool `query_cellar` : appele
- reponse finale : texte avec vins cites, mais pas de `show_recommendations`

Conclusion : le modele peut oublier l'action UI. Ce n'est pas forcement un bug de
routing ni un strip par `response-policy`.

Correction temporaire actuelle : `recommendation-action.ts` materialise des cartes
uniquement quand Celestin cite explicitement les bouteilles dans son texte. Il ne
fabrique plus de top 3 local, car ce fallback degradait fortement la qualite des
recommandations.

### Decision d'architecture

Ne pas laisser le LLM decider directement l'UI finale.

La cible recommandation doit separer trois responsabilites :

- LLM : choisir les bouteilles et expliquer le choix.
- Backend : resolver les bouteilles choisies en objets carte fiables.
- Response contract : retourner une selection structuree obligatoire sur les routes
  de recommandation actionnables.

Un `ui_action` optionnel est trop fragile pour une route dont le produit attend
des cartes. Le prochain pas ne doit pas etre une nouvelle consigne prompt, mais un
contrat structure type `RecommendationSelection`.

### Etat des risques

- Les corrections prompt/policy non souhaitees ont ete retirees avant commit.
- La fonction de recommandation est redeployee, mais le comportement reste a
  valider en dogfood sur paella / poulet roti / refinement couleur.
- Si Celestin dit "je vais chercher" sans nommer de bouteille, la version actuelle
  ne fabrique pas de cartes. C'est volontaire : mieux vaut pas de carte qu'une
  mauvaise carte.
- La prochaine correction doit donc porter sur le contrat de sortie ou le runtime,
  pas sur un ranking local de secours.

## Etat au 2026-05-03 matin

La reprise du chantier commence par la cible prioritaire : remplacer l'oubli de
`ui_action` par un contrat structure.

Changement en cours :

- ajout de `recommendation_selection` dans `CelestinResponse` ;
- ajout du champ aux schemas Gemini/OpenAI et au contrat JSON commun ;
- le LLM choisit les bouteilles dans `recommendation_selection` ;
- le backend resolve cette selection contre les bouteilles de la shortlist et
  construit `show_recommendations` ;
- fallback texte conserve seulement si le modele cite clairement des bouteilles ;
- observabilite enrichie avec `rawUiActionKind`, `finalUiActionKind` et les counts
  de selection structuree.

Decision :

- `ui_action` reste supporte pour compatibilite, mais la source de verite cible
  pour les recommandations devient la selection structuree, pas les cartes generees
  librement par le modele.
- Le backend est responsable de la materialisation UI.

## Etat au 2026-05-03 - contrat runtime stabilise

Le diagnostic live Supabase a confirme un bug de fond :

- le routeur pouvait etre correct (`recommendation_request`) ;
- la shortlist cave pouvait etre presente ;
- mais le provider pouvait rendre une reponse JSON valide sans `ui_action` et
  sans `recommendation_selection`.

La correction n'est pas un prompt supplementaire. Elle est dans le contrat runtime :

- une route de recommandation actionnable ne peut plus accepter une reponse finale
  sans action resoluble, sauf vraie clarification ;
- `ProviderAdapter` peut rejeter cette reponse comme violation de contrat et
  laisser le fallback provider tenter une reponse structuree ;
- `RecommendationAction` reste responsable de materialiser les cartes depuis
  `recommendation_selection` ou depuis des bouteilles explicitement citees ;
- les cartes finales passent par une petite policy deterministe quand l'accord a
  une contrainte dure evidente, par exemple sushi / poisson cru sans carte rouge ;
- l'encavage conversationnel suffisamment identifie produit une fiche
  deterministe plutot que de redemander une information secondaire ;
- les follow-ups courts de conversation vin peuvent etre recontextualises depuis
  l'historique quand le focus est prouvable.

Validation observee :

- tests cibles contrat : `recommendation-action`, `deterministic-response`,
  `turn-interpreter` ;
- `npm run verify` vert ;
- fonction Supabase `celestin` redeployee ;
- eval live finale : 40/40.

Regle de validation pour la suite :

- pendant le developpement, ne pas relancer toute l'eval LLM apres chaque micro
  correction ;
- ajouter ou renforcer d'abord le test deterministe du contrat touche ;
- utiliser les logs Supabase pour prouver la cause et l'effet sur les cas live ;
- lancer l'eval LLM complete seulement comme gate finale ou avant deploiement
  sensible.

## Etat au 2026-05-03 - recommandation selection-first

Le contrat recommandation est maintenant stabilise dans le sens du plan :

- `recommendation_selection` est la voie cible pour les recommandations cave ;
- le LLM choisit les bouteilles et fournit les raisons ;
- le backend resout les `bottle_id`, deduplique et construit les cartes ;
- `ui_action.show_recommendations` reste seulement une compatibilite, et n'est
  plus la source de verite quand une selection structuree existe ;
- le fallback "top 3 local" ne choisit plus a la place du LLM ;
- l'affichage frontend garde `appellation` et `millesime` separes, pour eviter le
  doublon visuel du millesime.

La note produit "niveaux d'audace" a ete retiree du backlog de ce chantier : ce
n'est pas une etape du refacto structurel actuel.

## Etat au 2026-05-03 - ProviderAdapter commence

Le ProviderAdapter reste encore dans `llm-providers.ts`, mais une premiere
separation concrete est en place :

- `provider-adapter.ts` normalise la trace provider ;
- chaque provider peut persister un apercu tronque du texte brut retourne ;
- la trace stocke aussi le resume normalise : `uiActionKind`,
  `recommendationSelectionCount`, `actionChipsCount`, `messagePreview` ;
- l'observabilite peut maintenant aider a separer trois causes :
  - le modele n'a pas emis le champ attendu ;
  - le parsing / wrapping a transforme la sortie ;
  - la policy ou le backend a retire ou materialise l'action.

Prochaine etape stricte du plan : nettoyer le `Response Contract` en separant
reponse conversationnelle, selection de vins, et action operationnelle
encavage/degustation. Ne pas ajouter de nouvelle dimension produit avant ce
nettoyage.

## Etat au 2026-05-03 - Response Contract commence

La separation du contrat reponse a commence cote schemas provider :

- les providers structures Gemini/OpenAI ne voient plus
  `ui_action.show_recommendations` comme action possible ;
- ils peuvent encore produire :
  - une reponse conversationnelle (`message`) ;
  - une selection de vins (`recommendation_selection`) ;
  - une action operationnelle (`prepare_add_wine`, `prepare_add_wines`,
    `prepare_log_tasting`) ;
- `show_recommendations` reste accepte par le parser pour compatibilite Claude /
  anciennes sorties, mais la voie cible est backend-only ;
- le type distingue maintenant les actions materialisees backend et les actions
  operationnelles.

Prochaine passe : faire descendre cette separation dans les types/runtime jusqu'a
ce que le modele ne soit plus conceptuellement responsable de l'UI.

## Etat au 2026-05-03 - Response Contract descendu dans le runtime

La separation provider/backend est maintenant explicite dans les types et les
directives :

- `CelestinProviderResponse` represente la sortie modele ;
- `CelestinResponse` represente la sortie finale renvoyee au frontend ;
- `OperationalUiAction` couvre les actions que le modele peut declencher
  (`prepare_add_wine`, `prepare_add_wines`, `prepare_log_tasting`) ;
- `BackendMaterializedUiAction` couvre `show_recommendations`, construit par le
  backend depuis `recommendation_selection` ;
- `rules.ts` et `prompt-context-policy.ts` ne demandent plus
  `show_recommendations` au modele, mais `recommendation_selection` ;
- le parser accepte encore `show_recommendations` pour compatibilite temporaire
  avec Claude / anciennes sorties, mais ce n'est plus le contrat cible.

La prochaine suppression legacy possible sera de refuser `show_recommendations`
dans `parseAndValidate` quand les logs provider confirment que la compatibilite
n'est plus necessaire.

## Etat au 2026-05-03 - ContextPlan exact sources

Debut de la verification route par route :

- `wine_question` reste sans profil, cave, souvenirs ni tools ;
- `recommendation_request` et `recommendation_refinement` gardent profil
  recommendation, shortlist cave, zones et souvenirs targeted ;
- `cellar_lookup` force `query_cellar` / cave `tool_only` / verite exacte ;
- `memory_lookup` ne charge plus de profil minimal : uniquement souvenirs exacts
  et `query_tastings` ;
- `tasting_log` ne charge plus de profil minimal : uniquement souvenirs exacts,
  `query_tastings`, historique normal, verite memoire.

Motif : les routes exactes doivent rester exactes. Le profil utilisateur peut
influencer une recommandation, mais il ne doit pas contaminer une question de
souvenir, de note ou de degustation passee.

## Etat au 2026-05-03 - RequestBody frontend reduit

Le frontend utilise deja `backend_managed` pour les tours texte hors photo. Une
nouvelle reduction est active :

- les suites texte d'encavage passent aussi en contexte backend-managed ;
- elles n'envoient plus cave pre-rankee, profil legacy, souvenirs frontend,
  profil compile, zones ou contexte jour/saison ;
- le backend resout les zones et le count cave via `ContextPlan` /
  `SourceResolver` ;
- les tours photo restent legacy pour l'instant, afin de ne pas melanger cette
  passe avec les flows OCR/image ;
- les suites de tasting restent legacy pour l'instant, a traiter quand le contrat
  degustation sera separe aussi proprement que recommandation/encavage.

## Principe directeur

Le frontend ne doit pas decider le contexte LLM.

Le frontend collecte l'interaction. Le backend decide ce que Celestin doit voir.

### Aujourd'hui

Le frontend envoie deja :

- cave resumee ;
- profil ;
- profil compile ;
- souvenirs ;
- historique ;
- zones ;
- contexte jour/saison ;
- traces.

Le backend route ensuite, puis filtre partiellement selon le mode.

Probleme :

- decision dispersee ;
- cave parfois preparee inutilement ;
- profil et souvenirs injectes trop largement ;
- cout tokens difficile a maitriser ;
- responsabilites floues entre `buildCelestinRequestBody`, `buildContextBlock`, `buildCelestinSystemPrompt`, `buildUserPrompt`.

### Cible

Le frontend envoie :

- message ;
- image si presente ;
- session id ;
- history compact ou references de session ;
- conversation state minimal ;
- request source / debug flags.

Le backend decide :

- route ;
- mode ;
- sources autorisees ;
- tools autorises ou forces ;
- niveau d'historique ;
- politique de verite ;
- profil/memoire/cave a recuperer.

## Phase 0 - Stabiliser le routage

Statut : commence.

Travail deja fait :

- ajout d'un banc `routing audit matrix` ;
- 30 cas single-turn ;
- 4 scenarios multi-tour ;
- premiere mesure : 13 echecs sur 59 tests ;
- corrections routing ;
- resultat actuel : 59/59 tests `turn-interpreter` passent.

Ce que cette phase doit garantir :

- les demandes cave exactes partent en `cellar_lookup` ;
- les questions culture vin partent en `wine_question` ;
- les recommandations partent en `recommendation_request` ;
- les souvenirs purs partent en `memory_lookup` ;
- les recommandations inspirees d'un souvenir restent des recommandations ;
- les follow-ups courts utilisent l'etat de conversation ;
- les annulations et acquittements sont stables.

Critere de fin :

- banc routing passe ;
- chaque bug routing utilisateur devient un test avant correction ;
- les routes critiques ont un exemple single-turn et un exemple multi-tour.

## Phase 1 - Definir la politique de contexte

Objectif :

Creer le contrat `ContextPlan`.

Il ne recupere rien et n'assemble rien. Il decide seulement.

Exemple de type :

```ts
type ContextPlan = {
  profile: 'none' | 'minimal' | 'recommendation' | 'memory'
  cave: 'none' | 'count' | 'shortlist' | 'tool_only' | 'full_debug'
  zones: 'none' | 'names'
  memories: 'none' | 'targeted' | 'exact'
  tools: 'none' | 'auto' | 'force_cellar' | 'force_memory' | 'force_tastings'
  history: 'compact' | 'normal' | 'pivot'
  truthPolicy: 'standard' | 'prudent_factual' | 'exact_only' | 'memory_only'
}
```

Regles initiales :

- `wine_question`
  - profil : none ou minimal ;
  - cave : none ;
  - souvenirs : none sauf demande explicite ;
  - tools : none ;
  - truth policy : prudent_factual.

- `cellar_lookup`
  - profil : none ;
  - cave : tool_only ;
  - zones : names ;
  - souvenirs : none ;
  - tools : force_cellar ;
  - truth policy : exact_only.

- `recommendation_request`
  - profil : recommendation ;
  - cave : shortlist ou tool_only ;
  - zones : names ;
  - souvenirs : targeted si signal affectif/personne/lieu ;
  - tools : auto ou force_cellar selon formulation ;
  - truth policy : standard avec contraintes personnelles.

- `memory_lookup`
  - profil : minimal ;
  - cave : none ;
  - souvenirs : exact ou targeted ;
  - tools : force_memory ou force_tastings ;
  - truth policy : memory_only.

Critere de fin :

- `buildContextPlan()` existe ;
- tests unitaires par route ;
- aucune source n'est incluse sans passer par le plan.

## Phase 2 - Introduire le SourceResolver

Objectif :

Deplacer progressivement la recuperation de contexte utile cote backend.

Responsabilite :

- lire le `ContextPlan` ;
- recuperer seulement les sources demandees ;
- retourner un objet structure, pas un prompt texte.

Sources :

- profil compile ;
- cave count ;
- cave shortlist ;
- zones ;
- souvenirs cibles ;
- resultats SQL/tools si pre-resolus ;
- contexte temporel minimal.

Important :

Le `SourceResolver` ne doit pas rediger. Il fournit des faits structures.

Critere de fin :

- cave brute full n'est plus envoyee par defaut depuis le frontend ;
- les questions exactes cave utilisent une source exacte ou un tool ;
- les souvenirs ne sont recuperes que si le plan le demande ;
- traces observabilite indiquent quelles sources ont ete resolues.

## Phase 3 - Simplifier le RequestBody frontend

Objectif :

Retirer au frontend la responsabilite de construire le contexte LLM.

Migration progressive :

1. Garder l'ancien body compatible.
2. Ajouter un mode backend-source pour routes ciblees.
3. Basculer `cellar_lookup` vers backend-source.
4. Basculer `wine_question`.
5. Basculer `memory_lookup`.
6. Basculer `recommendation_request`.
7. Supprimer les champs legacy inutiles.

Champs candidats a retirer du body standard :

- `cave` full summary ;
- `profile` legacy string ;
- `compiledProfileMarkdown` ;
- `memories` preconstruit ;
- `sqlRetrieval` legacy si remplace ;
- `context.recentDrunk` si resolu cote backend.

Champs a garder :

- `message` ;
- `image` ;
- `history` compact ;
- `conversationState` ;
- `sessionId` ;
- `requestSource` ;
- `debugTrace`.

Critere de fin :

- `buildCelestinRequestBody()` ne ranke plus toute la cave par defaut ;
- reduction mesurable des input tokens sur tours simples ;
- pas de regression sur reco/memoire.

## Phase 4 - Refondre l'assemblage prompt

Objectif :

Passer de plusieurs assembleurs implicites a un assembleur final clair.

Modules cibles :

- `identity`
- `stylePolicy`
- `knowledgePolicy`
- `actionPolicy`
- `modePolicy`
- `responseContract`

Le `PromptAssembler` prend :

- interpretation ;
- context plan ;
- resolved sources ;
- user message ;
- provider target.

Il produit :

- system prompt ;
- context block ;
- user prompt ;
- provider messages.

Regle :

Les prompts stables disent les regles. Les sources resolues donnent les faits. Le user prompt ne doit plus porter toute la complexite du routing.

Critere de fin :

- `buildUserPrompt()` est reduit ;
- `prompt-builder.ts` ne melange plus style, action, verite et format ;
- snapshots prompt mis a jour ;
- cas Chassagne couvert par truth policy.

## Phase 5 - Optimiser tools, cout et latence

Objectif :

Eviter les deux appels LLM quand la reponse peut etre deterministe.

Cas prioritaires :

- count cave ;
- count cave filtre par couleur/style simple (`rouges`, `blancs`, `roses`,
  `champagnes/bulles`) ;
- existence cave ;
- liste courte cave ;
- recuperation d'une note de degustation ;
- "combien de degustations".

Dette a traiter plus tard, hors chemin critique :

- tolerance aux fautes de frappe sur les mots structurels de routing (`bouteille(s)`,
  `cave`, `degustation(s)`). Exemple : `Combien de brouteilles...` ne doit pas etre
  ajoute comme cas lexical specifique ; il faut une couche de normalisation/fuzzy
  limitee avant routing, avec tests.

Strategie :

- pour `exact_only`, pre-resoudre via backend ou tool force ;
- si le resultat est simple, generer une reponse deterministe ou semi-template ;
- garder Claude pour la formulation quand il y a nuance, recommandation ou emotion.

Critere de fin :

- les tours `cellar_lookup` simples ne declenchent plus systematiquement un `tool_followup` couteux ;
- observabilite montre route, plan, sources, tool calls, tokens ;
- top cas couteux identifiables par route et source.

## Phase 6 - Eval qualite conversationnelle

Objectif :

Ne pas optimiser Celestin au point de le rendre froid.

Scenarios qualite :

- "Ce soir diner rapide avec Marc, pizza maison."
- "Plutot un rouge, a prendre dans ma cave."
- "Marc n'aime pas les tannins."
- "Un italien qui me rappelle Rome."
- "Tu te souviens du restaurant a Rome ?"
- "Et en blanc ?"

Ce qu'on mesure :

- bonne route ;
- bonnes sources ;
- pas de cave brute inutile ;
- souvenir retrouve au bon moment ;
- pas de souvenir gratuit ;
- cout tokens ;
- latence ;
- qualite de reponse.

Ameliorations a garder pour la selection des degustations :

- pondérer plus fortement les signaux affectifs et contextuels (`Rome`, `ma femme`,
  `restaurant`, `vacances`, `anniversaire`) quand ils apparaissent dans les notes
  de degustation ;
- distinguer deux usages :
  - souvenir exact (`tu te souviens du restaurant a Rome ?`) : rappel strict, source
    explicite, pas de generalisation ;
  - inspiration pour recommandation (`un italien qui me rappelle Rome`) : le souvenir
    sert de texture et de direction, mais la recommandation doit rester ancree dans
    la cave et le tour courant ;
- mieux exploiter les tags structures de degustation sans perdre les verbatims bruts ;
- exposer dans l'observabilite les degustations candidates, leur score et la raison
  de selection, pour auditer les cas ou Celestin cite un souvenir gratuit ;
- ajouter des evals Marc/Rome/Chianti avec conjoint, restaurant et cave multi-maison.

Optimisation memoire/profil a garder pour plus tard :

- conserver le profil compile Markdown comme source vivante et lisible par le LLM ;
- deriver au moment de la compilation un petit index structure optionnel
  (`pairingPreferences`, etc.) pour les besoins deterministes du `SourceResolver` ;
- ne pas maintenir manuellement deux sources de verite : le JSON structure doit etre un
  artefact derive du meme profil/facts, pas un second profil edite a cote.

Critere de fin :

- evals conversationnelles passent ;
- observabilite permet d'expliquer chaque tour ;
- les souvenirs gardent la texture emotionnelle.

## Ordre de travail recommande

1. Terminer Phase 0 et committer le banc routing.
2. Implementer `ContextPlan` sans changer encore la recuperation des sources.
3. Brancher `ContextPlan` dans `buildContextBlock()` pour retirer les blocs les plus evidents.
4. Basculer `cellar_lookup` vers source/tool exact sans cave brute.
5. Mesurer tokens/latence.
6. Basculer `wine_question`.
7. Basculer `memory_lookup`.
8. Traiter `recommendation_request` en dernier, car c'est le mode le plus sensible pour l'intimite produit.

## Risques

- Trop couper le contexte et perdre la personnalite.
- Trop faire confiance au routing.
- Remplacer des regex par un classifieur couteux sans preuve de gain.
- Garder deux chemins legacy trop longtemps.
- Optimiser le cout au detriment de la qualite sommelier.

## Garde-fous

- Chaque changement de route a un test.
- Chaque changement de source a un test `ContextPlan`.
- Chaque reduction de contexte est mesuree en tokens.
- Les scenarios Marc/Rome/cave multi-maison restent dans les evals.
- Les facts exacts cave/memoire ne viennent jamais de la generation libre.
