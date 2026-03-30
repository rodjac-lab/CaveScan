# Celestin - Retrieval Planner

## Objectif

Ajouter la couche qui manque entre la question utilisateur et les preuves injectees au prompt.

But produit :
- repondre juste aux questions exactes
- continuer a citer spontanement des souvenirs pertinents
- garder une conversation naturelle
- exploiter l'avantage unique de Celestin : la vie vin / table de l'utilisateur

## Ce qu'on garde

On ne casse pas l'architecture existante.

On garde :
- le `turn interpreter`
- la machine a etats
- le `prompt builder`
- le `User Model Resolver`
- Supabase comme source de verite
- le retrieval semantique existant

## Ce qu'on ajoute

On ajoute deux briques.

### 1. Retrieval Planner

Il decide quel contrat de verite est necessaire pour la question.

Contrats :
- `exact` : inventaire ou verification factuelle
- `synthese` : resume, comparaison, preference
- `semantique` : conversation, souvenir spontanee, rappel souple

### 2. Evidence Bundle

C'est le resultat du planner.

Il contient :
- les souvenirs retenus
- le niveau de verite attendu
- une formulation claire de ce qui est fourni au modele

Le LLM ne doit pas improviser au-dela de ce bundle.

## Regle centrale

Il ne faut plus traiter toutes les questions memoire avec le meme mecanisme.

### Questions exactes

Exemples :
- ai-je deja bu des Brunello ?
- quels vins italiens ai-je deja bus ?
- combien de Chianti ai-je degustes ?

Traitement :
- filtres exacts en code
- liste bornee et verifiable
- reponse ancree sur les donnees

### Questions de synthese

Exemples :
- qu'est-ce que j'ai pense des Brunello ?
- lequel j'avais prefere ?
- a quelles occasions j'en ai bu ?

Traitement :
- partir d'un sous-ensemble exact si possible
- puis laisser le LLM synthese ce sous-ensemble

### Questions semantiques

Exemples :
- tu sembles dire que j'aime les Brunello jeunes
- ca me fait penser a quoi dans mes souvenirs ?

Traitement :
- retrieval semantique
- souvenirs les plus pertinents
- place assumee pour la conversation naturelle

## Pipeline cible

1. `Turn Interpreter`
2. `User Model Resolver`
3. `Retrieval Planner`
4. `Evidence Bundle`
5. `Prompt Builder`
6. `LLM principal`

## Premiere livraison

La premiere livraison doit corriger le vrai manque actuel :
- les questions exactes sur les degustations passees
- les suivis implicites
- les cas de type `Brunello -> autres vins italiens`

Elle doit :
- conserver le retrieval semantique existant
- ajouter un planner local sur les bouteilles `drunk`
- distinguer `exact / synthese / semantique`
- envoyer au backend un bundle plus clair que le simple bloc `memories`

## Definition de succes

Le chantier est reussi si Celestin sait faire de facon fiable :
- `ai-je deja bu X ?`
- `quels autres vins italiens ai-je bus ?`
- `qu'est-ce que j'ai pense de X ?`
- citer spontanement un souvenir juste quand c'est utile
- dire `je ne vois que...` quand la preuve est partielle

## Anti-objectifs

On ne veut pas :
- creer 20 routes speciales ad hoc
- tout refaire
- remplacer la memoire existante
- transformer chaque question en mini pipeline lourd

Le bon design est :
- une seule couche de planification
- trois contrats de reponse
- une evidence mieux structuree
