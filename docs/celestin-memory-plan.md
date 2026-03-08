# Memoire Celestin

## Conversation

### Question

Donc on peut dire qu'on limite plus les infos qu'on lui donne sur nos gouts et nos souvenirs que sur notre cave?

### Reponse

Oui, clairement.

C'est meme une bonne maniere de le formuler:
- sur la cave, on lui donne presque toute la realite utile, bouteille par bouteille
- sur les gouts et souvenirs, on filtre davantage et on lui donne une version plus synthetique et plus selective

Pourquoi:
- la cave sert a repondre a des questions factuelles precises
- les gouts et souvenirs servent surtout a orienter la recommandation et la relation
- donc ils passent mieux sous forme de profil + souvenirs pertinents que comme historique brut complet

Donc oui:
- moins de limitation sur la cave
- plus de limitation sur les gouts et souvenirs

### Question

Elle est solide ta justification "Pourquoi". Honnetement, si on veut que celestin ait une super qualite conversationnel et une bonne connaissance de nos gouts, qu'elle est la meilleure solutions (Dans l'absolu, best in class, fait comme si on etait facebook et qu'on voulait connaitre chaque utilisateur par coeur) que faudrait-il faire?

### Reponse

Oui. Dans l'absolu, la meilleure solution n'est pas "un meilleur prompt". C'est une memoire utilisateur en plusieurs couches, avec mise a jour continue.

La cible best-in-class:
Il faudrait que Celestin ait en permanence 4 niveaux de connaissance sur chaque utilisateur:

1. Memoire factuelle longue duree
- cave complete
- historique complet des achats
- historique complet des degustations
- preferences explicites
- contextes de consommation recurrents
- personnes, occasions, habitudes

2. Profil infere vivant
- gouts deduits automatiquement
- aversions probables
- styles aimes selon saison, humeur, contexte, budget
- niveau d'ouverture a la nouveaute
- sensibilite au prix, au prestige, au rapport qualite-prix
- preferences stables vs preferences recentes

3. Memoire episodique
- souvenirs precis et dates
- "ce champagne avait marque l'anniversaire"
- "ce rouge avait tres bien marche avec l'osso bucco"
- "ce producteur avait decu malgre la note attendue"

4. Memoire conversationnelle
- ce qui vient d'etre dit
- ce qui a deja ete propose
- ce que l'utilisateur a valide, rejete, nuance
- l'etat implicite de la conversation

Ce qu'il faudrait faire techniquement:
- garder un journal complet d'evenements utilisateur
  - ajout cave
  - ouverture
  - degustation
  - partage
  - clic sur reco
  - refus
  - achat
  - rachat
- construire une couche de memoire structuree au-dessus
  - preferences stables
  - preferences recentes
  - exceptions
  - contradictions
- ajouter une memoire semantique interrogeable
  - embeddings / retrieval sur notes, conversations, souvenirs
- faire une selection de contexte dynamique
  - on n'envoie pas tout au modele
  - on lui envoie ce qui est le plus utile pour la question en cours
- maintenir un state tracker conversationnel
  - shortlist active
  - bouteille discutee
  - contraintes actuelles
  - objectif du tour

Le point le plus important:
Best-in-class, ce n'est pas:
- "donner plus de texte au LLM"

C'est:
- construire un systeme de memoire externe
- puis injecter la bonne memoire au bon moment

En pratique:
Si vous etiez "Facebook-scale", je ferais:
- un event store complet utilisateur
- un profil utilisateur recalcule en continu
- une memoire episodique indexee
- un retrieval par intention
- un orchestrateur qui choisit le bon contexte avant chaque reponse
- et seulement ensuite le LLM

Conclusion:
Pour que Celestin connaisse chaque utilisateur "par coeur", il faut le traiter comme un assistant avec:
- memoire factuelle
- memoire de gout
- memoire de souvenirs
- memoire de conversation

Le LLM ne doit pas etre la memoire.
Le LLM doit etre le cerveau qui raisonne sur une memoire externe tres bien organisee.

### Question

Je comprends! Et cette memoire externe tres bien organisee, il faudrait la stocker dans notre DB c'est ca?

### Reponse

Oui.

Dans votre cas, la base de donnees doit devenir la source de verite de cette memoire externe.

En pratique:
- une partie en tables structurees classiques
- une partie en champs calcules / profils
- eventuellement une partie indexee pour recherche semantique

Typiquement:
- bottles
- tastings
- user_preferences
- user_taste_profile
- conversation_memory
- memory_events
- eventuellement une table de memories_embeddings

Donc oui:
- la memoire ne doit pas vivre dans le prompt
- elle doit vivre dans votre DB
- puis etre selectionnee et injectee intelligemment au moment de la reponse

Le prompt sert a cadrer le comportement.
La DB sert a stocker la connaissance utilisateur.

### Question

Pourquoi tu dis "Dans votre cas"? on a dit best in class, le top, pas de contraintes.

### Reponse

Tu as raison.

Si on parle vraiment best in class absolu, pas "dans votre cas", alors la reponse est:

- oui, il faut une base de donnees
- mais pas seulement une DB relationnelle classique

Le top du top serait plutot une stack memoire complete, avec plusieurs couches specialisees:

1. Base transactionnelle
- source de verite des faits utilisateur
- achats, cave, degustations, preferences explicites, evenements

2. Store analytique / feature store
- profils calcules
- scores de preference
- tendances recentes
- segments comportementaux
- signaux temps reel

3. Memoire semantique / vector store
- notes de degustation
- souvenirs
- extraits de conversations
- situations similaires passees
- recuperation par similarite

4. Memoire conversationnelle courte duree
- etat actif de la session
- contexte des derniers tours
- elements actuellement discutes

5. Couche d'orchestration memoire
- decide quoi recuperer
- quoi resumer
- quoi injecter
- quoi garder pour plus tard

Donc si on parle du vrai "best in class":
- non, ce n'est pas juste "mettre ca dans la DB"
- c'est construire une architecture memoire multi-systeme

Pourquoi j'ai dit "dans votre cas":
- parce que pour CaveScan aujourd'hui, la prochaine etape realiste est bien la DB
- mais tu as raison, ce n'est pas la reponse ultime si on parle du niveau maximal possible

La version absolue serait:
- DB relationnelle pour les faits
- vector store pour les souvenirs et le retrieval
- feature store pour les preferences calculees
- orchestrateur memoire au-dessus

Donc correction:
- best in class absolu = pas seulement une DB
- best in class realiste pour vous aujourd'hui = commencer par structurer beaucoup mieux la memoire dans la DB, puis ajouter du retrieval semantique ensuite

### Question

c'est quoi concretement un vector store? feature store? si ce ne sont pas des db, de quoi s'agit il?

### Reponse

Ce sont quand meme des formes de stockage, mais specialisees.

Vector store:
- C'est une base optimisee pour retrouver du contenu "proche en sens", pas juste egal a une valeur.
- On transforme un texte en vecteur numerique via des embeddings.
- Ensuite on peut chercher:
  - "retrouve les souvenirs de degustation proches de cette question"
  - meme si les mots exacts ne sont pas les memes

Exemple:
- note stockee: "tres beau chenin tendu, superbe avec un poisson sauce beurre blanc"
- question: "j'avais adore un blanc vif sur un plat de poisson, tu t'en souviens ?"
- une DB classique ne trouve pas ca bien
- un vector store, si

Donc:
- ce n'est pas une base "metier" classique
- c'est une base de recherche semantique

Feature store:
- C'est un stockage de variables calculees sur l'utilisateur ou l'objet.
- Une "feature", c'est un signal exploitable par des modeles ou des regles.

Exemples de features utilisateur:
- pourcentage de blancs bus en ete
- note moyenne des pinots noirs
- propension a racheter des champagnes
- sensibilite au prix
- affinite avec la Loire
- ouverture aux accords audacieux

Ce ne sont pas des evenements bruts.
Ce sont des indicateurs derives, calcules a partir des donnees brutes.

Donc:
- un feature store sert a centraliser ces signaux calcules
- pour qu'ils soient coherents, reutilisables, et mis a jour proprement

Si ce ne sont pas des DB, alors quoi ?
En pratique, ce sont souvent quand meme des systemes de stockage ou des bases specialisees:
- un vector store peut etre:
  - Pinecone
  - Weaviate
  - pgvector dans Postgres
- un feature store peut etre:
  - une couche dediee type Feast
  - ou des tables bien organisees dans votre data stack

Donc:
- ce ne sont pas des concepts "magiques"
- ce sont des infrastructures specialisees pour des usages precis

En resume:
- DB classique = stocker les faits
- vector store = retrouver les souvenirs proches en sens
- feature store = stocker les signaux calcules utiles a la personnalisation

### Question

Je crois beaucoup a ce que tu as dis sur les 4 niveaux de connaissances et la stack memoire complete. Et donc oui, je veux bien que tu me fasses un schema concret pour que Celestin connaissent ses utilisateurs par coeur et avec la precision d'un best in Class!

### Reponse

Oui. Voici le schema concret que je ferais pour que Celestin tende vers un vrai niveau best-in-class.

Vue d'ensemble:
Celestin ne doit pas "se souvenir" tout seul.
Il doit raisonner sur une memoire externe organisee en 4 couches:

1. faits utilisateur
2. profil infere
3. souvenirs recuperables
4. etat conversationnel

1. Base de faits
C'est la verite brute.

A stocker:
- utilisateur
- bouteilles en cave
- achats
- ouvertures
- degustations
- notes libres
- tags extraits
- preferences explicites
- conversations importantes
- actions produit

Exemples de tables:
- users
- bottles
- purchases
- tastings
- tasting_photos
- user_preferences
- conversation_events
- assistant_feedback

Role:
- repondre aux questions factuelles
- recalculer les profils
- rejouer l'historique si besoin

2. Profil infere
C'est ce que le systeme deduit sur l'utilisateur.

A calculer en continu:
- couleurs preferees
- regions preferees
- producteurs preferes
- styles aimes
- niveau d'audace
- sensibilite au prix
- taux de rachat
- accords qui marchent souvent
- preferences saisonnieres
- preferences recentes vs stables

Exemples de stockage:
- user_taste_profile
- user_preference_features
- user_context_features

Exemples de features:
- likes_loire_whites = high
- rebuy_champagne_rate = 0.72
- summer_prefers_white_or_bubbles = true
- price_sensitivity = medium
- prefers_classic_pairings = high

Role:
- guider la recommandation
- personnaliser sans relire tout l'historique

3. Memoire semantique
C'est la memoire "souvenir".

A indexer:
- notes de degustation
- souvenirs marquants
- moments de vie
- extraits de conversation utiles
- accords reussis ou rates
- raisons d'aimer ou non un vin

Exemples:
- "ce vouvray avec le poisson ce soir-la etait superbe"
- "le barolo avait ete juge trop austere"
- "le champagne pour l'anniversaire avait marque"

Stockage:
- table de memoire
- embeddings associes
- recherche semantique

Exemples de tables:
- memory_snippets
- memory_embeddings

Chaque memoire contiendrait:
- user_id
- source_type
- text
- importance
- recency
- entities detectees
- embedding

Role:
- retrouver les bons souvenirs selon la question
- donner a Celestin une vraie continuite relationnelle

4. Etat conversationnel
C'est la memoire courte.

A stocker:
- sujet courant
- shortlist active
- bouteille en discussion
- contrainte en cours
- objectif du tour
- dernieres validations / refus

Exemples:
- "on parle d'un osso bucco"
- "la shortlist affichee = 3 vins"
- "l'utilisateur prefere finalement un blanc"
- "on compare la 2e bouteille"

Exemples de stockage:
- conversation_sessions
- conversation_state

Role:
- eviter que Celestin oublie le fil
- bien gerer les suivis

Pipeline ideal:
A chaque message utilisateur:

1. lire l'etat conversationnel court
2. recuperer les faits utiles
3. recuperer le profil infere
4. faire une recherche semantique sur les souvenirs pertinents
5. construire un contexte compact
6. envoyer ce contexte au LLM
7. enregistrer ce qui merite d'etre retenu

Exemple concret:
Utilisateur:
- "Je fais une paella, tu me conseilles quoi ?"

Le systeme recupere:
- cave reelle
- profil: aime les blancs tendus, evite les rouges tanniques
- souvenirs: "a adore un blanc salin avec fruits de mer"
- contexte: un blanc a deja ete propose ou non

Celestin repond alors avec:
- precision factuelle
- vraie personnalisation
- memoire relationnelle

Ce qui va ou:
- DB classique:
  - bouteilles
  - degustations
  - achats
  - preferences explicites
  - sessions
- Feature store:
  - scores et preferences calculees
  - signaux comportementaux
  - tendances
- Vector store:
  - souvenirs
  - notes
  - passages de conversation
  - experiences passees similaires

Version best-in-class:
Si on pousse au maximum:
- event store complet
- profils recalcules en continu
- memoire semantique avec importance/récence
- orchestration memoire avant chaque reponse
- apprentissage des feedbacks implicites
- separation nette entre:
  - faits
  - gouts
  - souvenirs
  - conversation

En une phrase:
Pour que Celestin connaisse ses utilisateurs "par coeur", il faut le batir comme un assistant pilote par une memoire externe multi-couches, pas comme un simple LLM avec un bon prompt.

## Plan

### V1

Objectif: rendre Celestin nettement meilleur sans changer toute l'architecture.

Ce qu'on met en place:
- garder la cave complete condensee
- ameliorer le user_taste_profile
- mieux structurer les preferences explicites
- mieux extraire les tags de degustation
- stocker quelques souvenirs "forts" en base
- ameliorer la selection dynamique des souvenirs selon la question
- ajouter un vrai etat conversationnel court

Concretement:
- tables solides pour:
  - bottles
  - tastings
  - user_taste_profiles
  - user_preferences
  - conversation_state
  - memory_snippets
- Celestin recoit:
  - cave condensee
  - profil synthetique
  - 3 a 5 souvenirs pertinents
  - etat de conversation actif

Resultat attendu:
- meilleure personnalisation
- meilleurs suivis
- reponses plus coherentes sur les gouts

### V2

Objectif: donner a Celestin une vraie memoire recuperable, pas seulement des resumes.

Ce qu'on ajoute:
- journal d'evenements utilisateur
- vector store pour notes, souvenirs et conversations utiles
- pipeline de creation de souvenirs a partir:
  - degustations
  - conversations
  - feedbacks implicites
- recuperation semantique avant chaque reponse
- distinction nette entre:
  - preferences stables
  - tendances recentes
  - souvenirs marquants

Concretement:
- nouvelles couches:
  - memory_events
  - memory_snippets
  - memory_embeddings
- retrieval par intention:
  - question cave
  - recommandation
  - souvenir
  - comparaison
- ranking des souvenirs par:
  - pertinence
  - recence
  - importance

Resultat attendu:
- Celestin "se souvient" mieux des experiences passees
- meilleure qualite relationnelle
- vraies reponses personnalisees, pas juste statistiques

### V3

Objectif: niveau best-in-class.

Ce qu'on ajoute:
- feature store complet
- profils recalcules en continu
- segmentation fine des gouts
- memoire multi-horizon:
  - court terme
  - moyen terme
  - long terme
- apprentissage sur feedback implicite
- orchestration memoire avancee avant chaque appel LLM
- eventuellement modeles specialises pour:
  - scoring des preferences
  - importance des souvenirs
  - detection de changement de gout

Concretement:
- stack complete:
  - DB transactionnelle
  - feature store
  - vector store
  - conversation state store
  - orchestrateur memoire
- Celestin recoit un contexte assemble sur mesure a chaque tour

Resultat attendu:
- assistant qui connait tres finement l'utilisateur
- forte continuite conversationnelle
- recommandations ultra personnalisees
- impression qu'il "connait la personne", pas juste sa cave

## Avancement V1 (mars 2026)

V1 quasi terminee. Voici ce qui a ete implemente et valide :

### Fait
- **Profil de gout enrichi** : agregation des tasting_tags (plats vecus, descripteurs recurrents, occasions typiques) dans ComputedTasteProfile, serialise dans le prompt Celestin
- **Souvenirs proactifs** : quand aucun souvenir ne matche la question par mot-cle, fallback sur les souvenirs les mieux notes / plus recents / sentiment fort — permet a Celestin de citer spontanement de bonnes experiences
- **Historique conversationnel enrichi** : les cards de recommandation et les fiches vin (encavage/degustation) sont resumees dans l'historique envoye au LLM, pour que Celestin comprenne "le deuxieme" ou "celui de droite"
- **Memoire cross-session** : les derniers echanges sont sauves dans localStorage, puis injectes comme contexte lors de la session suivante (rotation automatique, TTL 7 jours)
- **Prompt relationship** mis a jour pour guider l'utilisation des plats vecus, descripteurs, et de la session precedente

### Reste a faire (non fondamental)
- **Preferences explicites (UI)** : le type `ExplicitPreferences` existe (regions aimees/evitees, accords custom, notes libres) et est deja serialise dans le prompt, mais il n'y a aucun ecran pour que l'utilisateur les renseigne. Necessite une UI dans les Reglages. Non bloquant — les donnees vecues (P1 tasting tags) couvrent deja l'essentiel.
- **Migration memoire cross-session localStorage → Supabase** : le prototype localStorage fonctionne mais ne survit pas a un changement de device ou un clear du navigateur. Migrer vers une table Supabase rendrait la memoire cross-session persistante et multi-device. Non bloquant — la valeur est deja la avec localStorage.

## Recommandation

- V1 quasi terminee — valider en usage reel avant d'aller plus loin
- V2 ensuite si vous voyez que Celestin devient central dans l'usage
- V3 seulement si vous voulez construire un vrai moat produit autour de la memoire utilisateur

En une phrase:
- V1 = bon sommelier personnalise (quasi fait)
- V2 = sommelier avec memoire reelle
- V3 = assistant best-in-class qui connait l'utilisateur presque par coeur
