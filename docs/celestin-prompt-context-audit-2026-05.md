# Audit prompt et contexte Celestin - Mai 2026

## Objectif

Reprendre proprement la chaine qui fabrique ce que voit le LLM Celestin :

- quelles sont les sources de prompt et de contexte ;
- quel est leur role ;
- quand elles sont injectees ;
- si elles sont propres et maintenues ;
- comment elles sont assemblees avant l'appel LLM.

Le diagnostic de depart vient du tour Chassagne du 2026-05-02 : Celestin a affirme avec assurance que Chassagne-Montrachet etait surtout connu pour les rouges, alors que la question relevait d'un fait de culture vinicole precis et non source.

## Synthese courte

Le probleme n'est pas seulement un mauvais prompt.

Celestin a aujourd'hui deux forces :

- il a une architecture de routing deja solide ;
- il dispose de vraies sources personnelles : cave, profil compile, degustations, souvenirs, facts, tools SQL.

Mais ces sources ne sont pas encore gouvernees par une politique de contexte claire. Certaines sont injectees trop largement, d'autres pas assez, et les regles stables melangent encore style, format JSON, action UI, verite factuelle et memoire.

La refonte doit viser :

- garder l'intimite produit ;
- reduire le contexte brut inutile ;
- rendre les faits exacts plus fiables ;
- laisser Celestin vivant et sommelier sans le pousser a inventer ;
- expliciter quelle source gagne quand elles se contredisent.

## Architecture cible proposee

### 1. Core Identity

Ce bloc dit qui est Celestin.

Il doit rester court et stable :

- sommelier personnel francais ;
- tutoie l'utilisateur ;
- direct, chaleureux, avec du gout ;
- pas generique ;
- pas de theatre.

Il ne doit pas contenir :

- des regles de tools ;
- des regles de cave ;
- des regles de JSON ;
- des politiques de memoire detaillees.

Etat actuel :

- Source : `supabase/functions/celestin/persona.ts`
- Proprete : bonne base produit.
- Risque : pousse parfois trop fort l'assurance ("opinione", "convictions", "corrige les cliches").
- Action : scinder le style et la politique de prudence. Garder le ton, retirer l'incitation implicite a corriger avec certitude.

### 2. Knowledge Policy

Ce bloc dit comment Celestin traite les faits.

Il doit couvrir :

- faits cave et degustations : source exacte seulement ;
- faits utilisateur : profil compile ou tools ;
- faits de culture vin : nuance si non source ;
- volumes, histoire, statistiques, reputations comparatives : prudence obligatoire ;
- si incertain : dire "de memoire", "a verifier", ou formuler sans certitude.

Etat actuel :

- Source principale indirecte : `persona.ts`, `rules.ts`, `context-builder.ts`.
- Proprete : dispersee.
- Risque : en `wine_conversation`, Celestin a `WINE_CODEX + PERSONA + FORMAT`, mais pas une vraie politique de verite.
- Action : creer un module stable separe, par exemple `knowledge-policy.ts`, injecte dans tous les modes qui repondent a des questions de vin.

### 3. Mode Policy

Ce bloc dit comment repondre selon le mode cognitif.

Modes actuels :

- `wine_conversation`
- `cellar_assistant`
- `tasting_memory`
- `restaurant_assistant`
- `greeting`
- `social`

Etat actuel :

- Source : `prompt-builder.ts`, `rules.ts`, `user-prompt.ts`.
- Proprete : fonctionnelle, mais melangee.
- Risque : une partie importante des comportements vit dans `user-prompt.ts`, sous forme de branches ad hoc.
- Action : rendre explicite une politique par mode :
  - sources autorisees ;
  - sources interdites ;
  - style ;
  - tool policy ;
  - budget contexte.

### 4. Response Contract

Ce bloc dit comment l'app attend la reponse.

Il doit couvrir :

- JSON valide ;
- `message` ;
- `ui_action` ;
- `action_chips` ;
- schema des cartes et fiches.

Etat actuel :

- Source : `response-format.ts`
- Proprete : utile et stable.
- Risque : long, toujours injecte, couteux.
- Action : garder, mais separer du reste. Plus tard, regarder si le schema peut etre compresse ou rendu provider-native selon les cas.

### 5. Dynamic User Context

Ce bloc est le coeur produit.

Il ne doit pas etre traite comme un "bonus" a reduire. C'est ce qui distingue Celestin de ChatGPT ou Gemini.

Il doit apporter :

- cave ;
- zones / maisons ;
- profil compile ;
- souvenirs de degustation ;
- entourage ;
- contexte recent ;
- historique court ;
- resultats tools.

La question n'est pas "moins de contexte".

La bonne question est :

- quel contexte est utile pour ce tour ?
- quelle source est exacte ?
- quelle source est personnelle ?
- quelle source ne doit pas gagner contre le message courant ?
- combien de tokens vaut cette source ?

## Sources dynamiques auditees

### Profil compile

Role :

- donner a Celestin une connaissance durable et compacte de l'utilisateur ;
- garder les gouts, habitudes, proches, moments marquants, envies, style de conversation ;
- permettre une conversation intime.

Point d'entree :

- charge via `src/lib/userProfiles.ts`
- injecte dans le body par `src/lib/celestinChatRequest.ts`
- ajoute au contexte par `supabase/functions/celestin/context-builder.ts`

Quand il est injecte :

- presque tous les modes, si `compiledProfileMarkdown` existe ;
- sauf pas explicitement filtre par route.

Proprete / maintenance :

- architecture saine en intention ;
- compilation par `compile-user-profile` ;
- source finale construite par `shared/celestin/compiled-profile.ts` ;
- sanitisation, quotas, scores, sections optionnelles deja en place.

Risques :

- peut devenir trop influent sur des questions factuelles ;
- peut rappeler des souvenirs ou preferences quand ce n'est pas necessaire ;
- peut etre trop long si le profil grandit ;
- le style de conversation vit dans le profil alors qu'il pourrait etre une preference utilisateur distincte et compacte.

Action recommandee :

- garder le profil compile comme source centrale ;
- creer plusieurs rendus :
  - `profile_minimal` : style, 2-3 preferences fortes, entourage pertinent ;
  - `profile_recommendation` : gouts + aversions + entourage + habitudes ;
  - `profile_memory` : moments marquants + degustations notables ;
  - `profile_none` : pour certains faits de culture vin sans personnalisation.

### Cave

Role :

- donner les bouteilles disponibles ;
- permettre recommandation et inventaire ;
- ancrer Celestin dans le reel de l'utilisateur.

Point d'entree :

- `src/lib/celestinConversation.ts`
- `rankCaveBottles('generic', ..., input.cave.length)`
- envoie toute la cave resumee, classee par `local_score`.

Quand elle est injectee :

- detail complet en `cellar_assistant` ;
- seulement compte en `tasting_memory` ;
- pas detaillee en `wine_conversation` / `restaurant_assistant`.

Proprete / maintenance :

- donnees structurees propres ;
- mais serialization runtime trop large.

Risques :

- cout tokens important ;
- redondant avec `query_cellar` ;
- peut pousser Claude a repondre depuis la liste injectee au lieu d'appeler l'outil ;
- cave entiere pas necessaire pour toutes les recommandations.

Action recommandee :

- ne plus injecter toute la cave par defaut ;
- definir :
  - `cellar_count_only` pour inventaire outille ;
  - `cellar_shortlist` pour recommandation ;
  - `cellar_full_debug` uniquement debug/eval ;
  - `query_cellar` obligatoire ou fortement favorise pour count/list/existence.

### Zones / maisons

Role :

- representer la logistique reelle : maison principale, cave secondaire, zone de stockage ;
- permettre a Celestin de demander "quelle cave ?" quand cela change la reponse.

Point d'entree :

- `useZones()` cote frontend ;
- noms passes dans `body.zones` ;
- injectes seulement par `context-builder.ts` en `cellar_assistant`.

Quand elles sont injectees :

- en `cellar_assistant`, si zones presentes.

Proprete / maintenance :

- bonne source structuree ;
- peu couteuse ;
- actuellement sous-exploitee.

Risques :

- Celestin ne sait pas toujours quand demander quelle maison/cave ;
- les tools `query_cellar` ne filtrent pas encore explicitement par zone.

Action recommandee :

- garder les zones presque toujours disponibles en contexte minimal quand plusieurs zones existent ;
- ajouter une regle mode recommandation : si plusieurs zones et demande "dans ma cave", demander la zone si l'ambiguite impacte le choix ;
- envisager un filtre `zone` dans `query_cellar`.

### Souvenirs de degustation cibles

Role :

- donner de la texture vecue ;
- repondre a des questions sur degustations passees ;
- eviter que Celestin parle de preferences abstraites.

Point d'entree :

- `src/lib/tastingMemories.ts`
- serialization via `src/lib/tastingMemoryFormatting.ts`
- injection via `body.memories`.

Quand ils sont injectes :

- si retrieval non skippe ;
- en contexte pour presque tous les modes sauf greeting, social, restaurant.

Proprete / maintenance :

- bonne separation exact/synthesis ;
- bons garde-fous dans `buildMemoriesSection`.

Risques :

- encore une source texte parallele au profil compile et aux tools ;
- peut ajouter du bruit si la question ne demande pas un souvenir ;
- `memory_lookup` peut couter deux appels Claude.

Action recommandee :

- conserver pour la texture qualitative ;
- ne pas l'utiliser pour count/list/existence ;
- pour les questions factuelles, preferer `query_tastings` ;
- limiter l'injection aux routes qui en ont besoin.

Point produit important :

Les souvenirs ne sont pas seulement des donnees. Ce sont des emotions, des lieux, des personnes et des moments. Celestin doit pouvoir les retrouver au bon moment sans les injecter en permanence.

La bonne strategie n'est donc pas "souvenirs toujours dans le prompt", mais :

- garder dans le profil compile quelques marqueurs affectifs tres compacts : Rome, restaurant marquant, Marc n'aime pas les tannins, souvenir de vacances, etc. ;
- detecter les signaux du tour courant : personne, lieu, humeur, occasion, repas, bouteille deja bue ;
- utiliser ces signaux pour declencher `memory_lookup` ou un bundle de souvenirs cible ;
- autoriser Celestin a faire une passerelle subtile : "Ca me fait penser a ton souvenir a Rome..." seulement si le lien est fort.

Le test qualite ici doit etre conversationnel, pas seulement technique :

- "Diner rapide avec Marc, pizza maison" doit rappeler Marc et ses preferences ;
- "Un italien qui me rappelle Rome" doit retrouver le souvenir de restaurant ;
- "Je veux un rouge leger" ne doit pas rappeler Rome gratuitement.

### Historique court

Role :

- conserver la continuite immediate ;
- permettre les follow-ups ;
- eviter que Celestin perde le fil.

Point d'entree :

- `buildHistory()` dans `src/lib/celestinConversation.ts`
- inclut texte, cartes proposees, fiches encavage/degustation, images recentes.

Quand il est injecte :

- toujours dans les messages provider ;
- legerement modifie pour `exploratory_reco_pivot`.

Proprete / maintenance :

- utile et assez simple ;
- images anciennes retirees sauf les deux dernieres.

Risques :

- pas de limite explicite en nombre de tours dans `buildHistory()` ;
- peut ancrer un fait faux ou une reponse hallucinee recente ;
- peut gonfler le cout ;
- pas de nettoyage des reponses assistant douteuses.

Action recommandee :

- caper explicitement l'historique envoye au provider ;
- garder plus longtemps les intentions utilisateur que les longues reponses assistant ;
- marquer ou compacter les cartes/fiches ;
- ne pas laisser une erreur assistant recente devenir une source de verite.

### Tools SQL Claude

Role :

- source exacte pour cave, degustations, memoire conversationnelle brute ;
- remplacer les anciens blocs SQL preconstruits.

Point d'entree :

- `supabase/functions/celestin/tools.ts`
- activation par `tool-policy.ts`
- execution dans `llm-providers.ts`.

Quand ils sont disponibles :

- authentifie ;
- pas d'image ;
- route ou mode factuel :
  - `cellar_lookup`
  - `memory_lookup`
  - `tasting_log`
  - `recommendation_request`
  - `recommendation_refinement`
  - `memory_guided_recommendation`
  - modes `cellar_assistant` et `tasting_memory`.

Proprete / maintenance :

- bonne direction ;
- user-scoped ;
- pas de SQL libre ;
- limites de volume.

Risques :

- `tool_choice: auto`, donc Claude peut ne pas appeler l'outil ;
- deux appels Claude si tool ;
- followup encore couteux ;
- fallbacks Gemini/OpenAI n'ont pas ces tools ;
- `query_cellar` ne filtre pas encore par zone.

Action recommandee :

- forcer ou pre-router certains outils pour count/list/existence ;
- supprimer le second appel Claude sur resultats simples ;
- ajouter un resultat deterministe pour `count` ;
- ajouter zone/location comme input tool ;
- bloquer les fallbacks non-tooles sur questions exactes.

### Wine Codex

Role :

- base de connaissances vin stable ;
- accords, service, styles adjacents, convictions.

Point d'entree :

- `wine-codex.ts`
- injecte en `wine_conversation`, `restaurant_assistant`, `cellar_assistant`.

Quand il est injecte :

- tous les modes qui parlent de vin sauf `tasting_memory`, `greeting`, `social`.

Proprete / maintenance :

- propre, court, lisible ;
- mais volontairement general.

Risques :

- trop faible pour les questions de culture vin precise ;
- ne contient pas de politique d'incertitude ;
- sur Chassagne, il n'avait aucune source.

Action recommandee :

- ne pas essayer d'y mettre toute l'encyclopedie vin ;
- ajouter une `Knowledge Policy` separee ;
- eventuellement ajouter un micro-codex "Bourgogne / appellations classiques" si cela revient souvent, mais attention a la maintenance.

Position recommandee :

Ne pas compter aveuglement sur la connaissance generale du LLM pour les faits precis, mais ne pas transformer `Wine Codex` en encyclopedie maison.

Le bon role du `Wine Codex` est :

- principes durables ;
- heuristiques de sommelier ;
- repaires classiques a forte valeur produit ;
- points ou une erreur serait frequente et couteuse pour la confiance.

Pour Chassagne, il peut etre pertinent d'ajouter un micro-repere Bourgogne, mais seulement sous forme courte et maintenable. Exemple : "Chassagne-Montrachet est fortement associe aux blancs de Chardonnay, tout en ayant une production rouge historiquement importante ; ne pas presenter Chassagne comme surtout rouge sans source."

Pour le reste :

- laisser le LLM utiliser sa culture generale pour les questions simples ;
- imposer la prudence pour volumes, statistiques, classements et reputations comparatives ;
- plus tard, envisager une source externe verifiee si Celestin devient un assistant de connaissance vinicole avancee.

### Persona

Role :

- donner l'identite et le style.

Point d'entree :

- `persona.ts`
- injecte dans tous les modes.

Quand il est injecte :

- toujours via `prompt-builder.ts`.

Proprete / maintenance :

- bon alignement produit ;
- trop de responsabilites : style, souvenirs, prudence, interdits.

Risques :

- peut encourager l'assurance ;
- "corrige les cliches" peut amplifier une fausse correction ;
- "Si tu as des connaissances partielles, partage-les avec nuance" est bon, mais noye dans un prompt long.

Action recommandee :

- le scinder en :
  - `identity.ts`
  - `style-policy.ts`
  - `truth-policy.ts`

### Capabilities

Role :

- dire ce que Celestin sait faire.

Point d'entree :

- `capabilities.ts`
- injecte uniquement en `cellar_assistant`.

Quand il est injecte :

- pas en `wine_conversation`.

Proprete / maintenance :

- propre et court.

Risques :

- pas assez utile pour justifier un module separe ;
- certaines phrases sont plutot de la mode policy.

Action recommandee :

- fusionner dans `Mode Policy` ou garder tres court.

### Rules

Role :

- dire quand utiliser `ui_action` ;
- rules cave ;
- souvenirs ;
- photos ;
- extraction.

Point d'entree :

- `rules.ts`
- injecte en `cellar_assistant` et `restaurant_assistant`.

Quand il est injecte :

- pas en `wine_conversation`.

Proprete / maintenance :

- utile ;
- trop large.

Risques :

- melange orchestration UI, verite factuelle et extraction ;
- les questions de culture vin n'ont pas ces garde-fous ;
- certaines regles duplicate avec `user-prompt.ts`, `context-builder.ts`, tools.

Action recommandee :

- scinder :
  - `action-policy.ts`
  - `cellar-truth-policy.ts`
  - `memory-truth-policy.ts`
  - `image-policy.ts`
  - `extraction-policy.ts`

### User Prompt dynamique

Role :

- adapter l'instruction du tour courant.

Point d'entree :

- `user-prompt.ts`
- construit apres routing et state.

Quand il est injecte :

- toujours, comme dernier message user.

Proprete / maintenance :

- puissant ;
- mais devenu le point de complexite principal.

Risques :

- branches nombreuses ;
- instructions parfois trop fortes ;
- `wine_conversation` dit "reponds avec tes connaissances, concis et direct", ce qui a contribue au cas Chassagne ;
- certaines routes exactes dependent encore du bon vouloir de Claude.

Action recommandee :

- remplacer progressivement par une table de directives par mode/route ;
- separer :
  - intent du tour ;
  - source policy ;
  - style ;
  - action attendue.

## Assemblage reel aujourd'hui

### Cote frontend

1. L'utilisateur envoie un message dans Celestin.
2. `prepareCelestinRequest()` lance en parallele :
   - `buildMemoryEvidenceBundle()`
   - `getCompiledUserProfileCached()`
3. `buildCelestinRequestBody()` construit le body :
   - message courant ;
   - history ;
   - cave resumee ;
   - profil brut fallback ;
   - memories ;
   - contexte jour/saison/recentDrunk ;
   - zones ;
   - conversationState ;
   - compiledProfileMarkdown ;
   - sessionId.

### Cote edge function

1. `runCelestinTurn()` recoit le body.
2. `interpretTurnWithRouting()` decide :
   - `turnType` ;
   - `cognitiveMode` ;
   - route gagnante.
3. `buildContextBlock()` assemble le contexte dynamique selon le mode.
4. `buildCelestinSystemPrompt(mode)` choisit les modules stables.
5. Le system prompt final est :

```text
modules stables selon mode

--- CONTEXTE UTILISATEUR ---

contextBlock dynamique
```

6. `buildUserPrompt()` fabrique l'instruction du tour.
7. `buildProviderHistory()` choisit l'historique provider.
8. `celestinWithFallback()` appelle Claude puis fallbacks.
9. Claude recoit :
   - system prompt ;
   - history provider ;
   - user prompt courant ;
   - tools si actives.
10. Si Claude appelle un tool :
   - le tool SQL s'execute ;
   - resultat renvoye a Claude ;
   - second appel `tool_followup`.
11. `applyResponsePolicy()` nettoie les `ui_action` interdites.
12. observabilite persiste route, mode, tokens, tool calls, latence.

## Diagnostic du cas Chassagne

Tour concerne :

- mode : `wine_conversation`
- route : `wine_question` ou `unknown`
- tools : desactives
- cave detaillee : non injectee
- source externe : aucune
- system stable : `WINE_CODEX + PERSONA + RESPONSE_FORMAT`
- user prompt : "QUESTION VIN - Reponds avec tes connaissances. Sois concis et direct..."

Conclusion :

L'erreur n'est pas un bug SQL.

Elle vient d'un mode conversation vin qui autorise une reponse de culture generale avec style et assurance, sans vraie politique de prudence sur les faits viticoles precis.

La reponse aurait du etre de type :

```text
Oui, Chassagne est aujourd'hui tres associe aux blancs de Chardonnay, meme s'il garde une histoire et une production rouge plus importante que Puligny. Je ne te donne pas les volumes exacts de memoire, mais l'image "Chassagne = surtout rouge" serait trompeuse.
```

## Priorites de refonte

### Priorite 0 - Fiabilite routing / interpreter / state machine

La politique de sources ne doit pas supposer que les routes sont parfaites.

Si tout repose sur `route + mode`, il faut d'abord mesurer :

- precision du `Turn Interpreter` ;
- stabilite de la machine a etat ;
- cas ambigus : follow-up court, correction utilisateur, question vin generale, demande cave implicite ;
- confusion entre `wine_question`, `cellar_lookup`, `recommendation_request`, `memory_lookup` ;
- impact d'une mauvaise route sur les sources injectees et les tools disponibles.

Action recommandee :

- creer un petit jeu d'evaluation routing avec 30 a 50 tours reels ou proches du reel ;
- logger route attendue / route obtenue / sources attendues ;
- ajouter des tests unitaires sur `interpretTurnWithRouting()` et les transitions ;
- definir des politiques robustes quand la route est incertaine.

Regle de conception :

Une mauvaise route ne doit pas pouvoir provoquer une reponse factuelle assuree sans source, ni un acces cave/memoire incoherent. La `Knowledge Policy` doit donc rester active en filet de securite, meme si le routeur hesite.

Audit execute le 2026-05-02 :

- 30 cas single-turn ajoutes dans `turn-interpreter.test.ts` ;
- 4 scenarios multi-tour ajoutes ;
- premiere mesure : 13 echecs sur 59 tests ;
- apres corrections routing : 59/59 passent sur le banc `turn-interpreter`.

Failles trouvees :

- inventaire avec ordre naturel inverse : "J'ai combien de bouteilles de Chassagne ?" ;
- inventaire domaine : "Quels vins de Dujac j'ai ?" ;
- questions culture vin sans amorce "c'est quoi" : "Chassagne blanc ou rouge ?", "plus connu pour les rouges ou les blancs ?" ;
- service temperature : "A quelle temperature je sers..." ;
- recommandations naturelles : "un rouge leger pour une pizza", "choisis dans ma cave" ;
- souvenir emotionnel utilise comme recommandation : "quelque chose qui rappelle le restaurant a Rome" ;
- follow-up cave court : "Et en blanc ?", "dans l'autre maison ?" ;
- annulation en idle : "Laisse tomber".

Corrections apportees :

- signaux routing enrichis dans `turn-signals.ts` ;
- `routeIdle()` gere maintenant l'annulation ;
- `routeIdle()` reconnait les recommandations guidees par souvenir ;
- `routePostTaskAck()` traite les contraintes de cave/zone comme refinement de recommandation quand une recommandation vient d'etre proposee ;
- "Choisis dans ma cave" est maintenant considere comme une recommandation, meme sans classifieur externe.

### Priorite 1 - Politique de sources par route

Creer une matrice code/document :

- route ;
- mode ;
- sources dynamiques autorisees ;
- sources dynamiques interdites ;
- tool policy ;
- budget contexte.

Exemples :

- `wine_question`
  - profil minimal ou aucun profil ;
  - pas de cave brute ;
  - pas de souvenirs sauf demande explicite ;
  - knowledge policy active ;
  - pas d'affirmation statistique certaine sans source.

- `cellar_lookup`
  - zones ;
  - pas cave full ;
  - tool `query_cellar` force ou fortement favorise ;
  - reponse deterministe possible pour count.

- `recommendation_request`
  - profil recommendation ;
  - zones si plusieurs caves ;
  - shortlist cave ou tool ;
  - souvenirs seulement si pertinents.

- `memory_lookup`
  - profil minimal ;
  - tool `query_tastings` ou memories exactes ;
  - pas de cave comme preuve de degustation.

### Priorite 2 - Scinder les prompts stables

Remplacer les modules actuels par :

- `identity.ts`
- `style-policy.ts`
- `knowledge-policy.ts`
- `action-policy.ts`
- `mode-policy.ts`
- `response-contract.ts`

Ne pas tout modifier d'un coup en production sans snapshots.

### Priorite 3 - Rendus du profil compile

Ajouter une couche de rendu du profil :

- minimal ;
- recommendation ;
- memory ;
- full debug.

Le profil compile reste la source, mais son injection devient adaptee au tour.

Gain attendu :

- cout : eviter d'envoyer tout le profil pour une question de culture vin simple ;
- qualite : eviter que des preferences utilisateur biaisent une reponse factuelle ;
- intimite : garder les bons details personnels dans les recommandations et les moments de conversation ;
- controle : savoir pourquoi Celestin a vu tel souvenir ou telle preference.

Ce n'est pas la priorite si le profil compile est encore court. Cela devient important quand le profil grandit ou quand on observe qu'il influence trop les reponses hors contexte.

### Priorite 4 - Cave via tools et shortlist

Remplacer la cave brute full par :

- count + zones ;
- shortlist pour recommandation ;
- tool exact pour inventaire ;
- full uniquement debug/eval.

### Priorite 5 - Historique plus propre

Mettre une limite explicite.

Garder :

- dernieres intentions utilisateur ;
- dernieres contraintes ;
- dernieres cartes/fiches compactees.

Eviter :

- longues reponses assistant comme source de verite ;
- propagation d'une hallucination recente.

## Definition de "propre et maintenu"

Une source est propre si :

- elle a un role unique ;
- elle a un proprietaire code clair ;
- elle est testee par snapshot ou unit test ;
- elle a une politique d'injection ;
- elle a une limite de taille ;
- elle a une hierarchie de confiance.

Etat actuel :

- Profil compile : plutot propre, mais rendu runtime trop unique.
- Tools SQL : plutot propres, mais orchestration incomplete.
- Cave : source propre, injection trop large.
- Souvenirs : plutot propres, injection a resserrer.
- Persona : bon produit, trop de responsabilites.
- Wine Codex : propre, mais trop faible pour garantir les faits precis.
- User Prompt : fonctionnel, mais dette principale.
- History : utile, mais non gouverne.

## Prochaine etape recommandee

Ne pas commencer par reecrire tous les prompts.

Commencer par verifier que le routeur est assez fiable pour porter une politique de contexte.

Si le routeur est fiable, implementer la politique.

S'il est imparfait, implementer une politique defensive : routes exactes quand elles sont certaines, prudence et contexte minimal quand elles ne le sont pas.

Commencer par un document/code de politique :

```text
route + mode -> ContextPlan
```

Puis implementer un `buildContextPlan()` qui decide :

- profil : none/minimal/recommendation/memory ;
- cave : none/count/shortlist/full ;
- zones : yes/no ;
- memories : none/exact/synthesis ;
- tools : none/auto/forced ;
- history : normal/compact/pivot ;
- truth policy : standard/factual/prudent.

Ensuite seulement, faire evoluer les modules de prompt stable autour de cette politique.
