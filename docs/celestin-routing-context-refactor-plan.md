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
- existence cave ;
- liste courte cave ;
- recuperation d'une note de degustation ;
- "combien de degustations".

Dette a traiter plus tard, hors chemin critique :

- tolerance aux fautes de frappe sur les mots structurels de routing (`bouteille(s)`,
  `cave`, `degustation(s)`). Exemple : `Combien de brouteilles...` ne doit pas etre
  ajoute comme cas lexical specifique ; il faut une couche de normalisation/fuzzy
  limitee avant routing, avec tests.
- comptages filtres de cave (`combien de rouges/blancs/champagnes en cave`) :
  a traiter comme source exacte deterministe, pas comme reponse generee librement.
  Cas observe le 2026-05-02 : `combien j'ai de rouge en cave` peut produire un
  resultat faux tant que ce chemin n'est pas implemente.

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
