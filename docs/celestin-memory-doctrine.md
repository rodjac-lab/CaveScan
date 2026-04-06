# Doctrine simple de la mémoire Celestin

## Pourquoi ce document

Ce document est un pense-bête.

Son but n'est pas de décrire toute l'architecture.
Son but est de rappeler, simplement :

- ce qu'est la mémoire de Celestin
- à quoi elle sert
- quelles sources doivent être prioritaires
- quelles erreurs il faut éviter

Documents associés :

- [Architecture runtime](./celestin-memory-runtime-architecture.md)
- [Événements de compilation](./celestin-memory-compilation-events.md)
- [Index doc](./README.md)

## Idée centrale

Celestin n'est pas un assistant généraliste.
Celestin doit devenir un **conseiller vin personnel**.

Sa force ne vient pas d'une conversation plus brillante que ChatGPT.
Sa force vient du fait qu'il connaît :

- la cave
- les goûts réels de l'utilisateur
- ses dégustations passées
- ses souvenirs marquants
- le fil de la relation

Donc :

- la mémoire est un pilier du produit
- mais la mémoire n'a de valeur que si elle améliore le conseil

## Le principe théorique

### La mémoire ne doit pas être juste "retrouvée"

Il existe deux façons naïves de construire un système mémoire :

- tout stocker, puis relire les sources brutes à chaque requête
- tout faire tenir directement dans le prompt ou dans le modèle

Ces deux approches ont une limite :

- elles deviennent vite bruyantes
- elles généralisent mal
- elles récupèrent souvent des choses vraies mais peu utiles
- elles rendent le système difficile à raisonner

### Il faut une couche intermédiaire

La bonne architecture est en général :

1. **stockage brut**
2. **mémoire compilée**
3. **réponse**

Autrement dit :

- les sources brutes sont la matière première
- la mémoire compilée est une couche intermédiaire maintenue dans le temps
- la réponse du LLM doit s'appuyer d'abord sur cette mémoire compilée, pas sur un vrac de sources

```text
Sources brutes
(questionnaire, cave, degustations, conversations)
        |
        v
Memoire compilee
(profil compile utilisateur)
        |
        v
Reponse
(conseil, rappel, conversation)
```

### Ce qu'est une mémoire compilée

Une mémoire compilée n'est pas juste un duplicat des données.

C'est une mémoire qui a déjà subi un travail de :

- sélection
- reformulation
- hiérarchisation
- déduplication
- révision

Elle sert à transformer :

- beaucoup de données hétérogènes

en :

- peu de signaux utiles et exploitables

### Ce qu'est une mémoire maintenue

Une bonne mémoire n'est pas figée.
Elle doit être maintenue.

Cela veut dire :

- ajouter de nouveaux faits
- corriger les anciens
- retirer les faits devenus faux ou obsolètes
- éviter les doublons
- éviter les généralisations trop rapides

Donc la vraie difficulté n'est pas seulement :

- "comment stocker ?"

La vraie difficulté est :

- "comment maintenir une mémoire juste dans le temps ?"

```text
Nouveaux signaux
        |
        v
Selection
        |
        v
Compilation
        |
        v
Revision / deduplication / expiration
        |
        v
Memoire plus propre
```

### Conséquence importante

Le retrieval seul ne suffit pas.

Même un bon retrieval peut remonter :

- un souvenir secondaire
- un fait vrai mais anecdotique
- une généralisation trop large
- un vieux signal devenu moins pertinent

Donc il faut toujours :

- une couche compilée
- une hiérarchie entre sources
- une maintenance conservative

### Formule théorique simple

Une bonne mémoire produit doit suivre cette logique :

- **stocker brut**
- **compiler peu**
- **maintenir dans le temps**
- **répondre avec prudence**

## Ce qu'on a appris

Le problème n'est pas seulement "avoir de la mémoire".

Le vrai problème est :

- quelles sources de mémoire existent
- comment elles sont compilées
- et surtout laquelle doit gagner quand elles se contredisent

Autrement dit :

- trop de mémoire mal hiérarchisée = mauvaises réponses
- moins de mémoire, mais mieux priorisée = meilleur produit

## Les niveaux de mémoire

### 1. Sources brutes

Ce sont les données d'origine.

Chez Celestin :

- questionnaire
- cave
- dégustations
- conversations

Ces sources sont utiles, mais elles ne doivent pas être injectées aveuglément.

### 2. Mémoire compilée

C'est la mémoire dérivée des sources brutes.

Chez Celestin, la cible est désormais :

- un profil utilisateur compilé unique
- stocké en Markdown en base
- maintenu dans le temps par patchs ciblés

Cette mémoire compilée doit être :

- plus petite
- plus propre
- plus utile
- plus révisable

### 3. Réponse

La réponse de Celestin doit s'appuyer sur :

- le tour en cours
- la mémoire compilée pertinente
- des requêtes SQL ciblées sur les sources brutes utiles

Mais elle ne doit pas être construite comme si toutes les sources avaient le même statut.

## Règle de base

Ne pas généraliser trop tôt.

Exemple :

- "Plutôt un rouge" n'est pas une préférence durable
- "Je cherche un vin italien" n'est pas une préférence durable
- "J'ai aimé ce Brunello jeune et fruité" est un fait utile
- "Le Sanlorenzo 2007 était trop évolué pour moi" est un fait utile

Donc :

- mieux vaut stocker des faits précis
- que des préférences larges déduites trop vite

## Hiérarchie simple des sources

Quand plusieurs sources se contredisent, l'ordre de priorité doit être :

### 1. Le signal explicite du tour en cours

Ce que l'utilisateur dit maintenant.

Exemples :

- "Ce soir c'est poulet rôti"
- "Je cherche un rouge"
- "Et le Rayas, il était comment ?"

C'est toujours la source la plus prioritaire.

### 2. Les expériences réelles, spécifiques, vécues

Exemples :

- notes de dégustation
- souvenirs d'accords réussis
- réactions explicites à un vin

Ces signaux sont plus fiables qu'un profil abstrait.

### 3. La mémoire conversationnelle consolidée

Exemples :

- `user_memory_facts`
- profil compilé utilisateur
- quelques facts bruts encore utiles pour la compilation

Cette couche sert à aider, pas à remplacer les sources plus concrètes.

### 4. Le questionnaire initial

Le questionnaire sert :

- à démarrer
- à donner un premier profil
- à personnaliser les premiers échanges

Mais ensuite :

- il doit devenir secondaire
- il ne doit pas écraser les dégustations réelles
- il ne doit pas écraser les souvenirs vécus

Le questionnaire est un **bootstrap**, pas une vérité durable.

## Ce que Celestin doit faire

### En recommandation

La priorité est :

1. contexte actuel
2. cave
3. goûts réellement observés
4. éventuellement un souvenir utile

Un souvenir ne doit être cité que s'il aide à justifier le conseil.

Il ne doit jamais être rappelé juste pour faire joli.

### En question souvenir

La priorité est :

1. souvenirs de dégustation
2. facts de soutien si utiles
3. profil compilé si nécessaire pour contextualiser

La règle :

- exactitude avant richesse

### En conversation culture vin

La priorité est :

1. réponse juste
2. pédagogie

La mémoire personnelle ne doit intervenir que si elle aide vraiment.

## Les erreurs à éviter

### 1. Généraliser sur un échantillon trop faible

Exemple mauvais :

- 2 dégustations italiennes -> "aime les rouges italiens jeunes"

### 2. Transformer un choix de tour en préférence durable

Exemple mauvais :

- "Plutôt un rouge" -> préférence stable

### 3. Utiliser un souvenir décoratif

Exemple mauvais :

- rappeler Rome dès qu'on parle d'Italie

### 4. Laisser le questionnaire dominer l'expérience réelle

Exemple mauvais :

- questionnaire dit "aime les vins évolués"
- dégustations récentes disent l'inverse
- Celestin suit quand même le questionnaire

### 5. Vouloir être trop intelligent trop tôt

Une mémoire trop sophistiquée, mais mal hiérarchisée, donne des réponses moins justes.

## Principe de prudence

La règle la plus importante est :

- mieux vaut oublier que se tromper

Donc :

- mieux vaut une mémoire sobre qu'une mémoire envahissante
- mieux vaut un fait précis qu'une généralisation large
- mieux vaut une synthèse conservative qu'une synthèse ambitieuse mais fausse

## Formule simple à retenir

Celestin raisonne sur :

1. ce que l'utilisateur dit maintenant
2. ce qu'il a vraiment vécu
3. ce qu'on a prudemment compilé
4. ce que le questionnaire avait suggéré au départ

## Traduction produit

Le but n'est pas :

- "avoir le plus de mémoire possible"

Le but est :

- avoir la mémoire la plus juste et la plus utile possible

Une bonne mémoire Celestin doit rendre le produit :

- plus fiable
- plus personnel
- plus crédible
- plus difficile à remplacer

## Traduction technique

Quand on hésite sur une implémentation, on doit se poser ces questions :

1. Est-ce qu'on stocke un fait ou une généralisation ?
2. Est-ce que cette mémoire est durable ou temporaire ?
3. Est-ce qu'elle est mieux fondée que les signaux vécus existants ?
4. Est-ce qu'elle aidera vraiment Celestin à mieux répondre ?
5. Si elle est fausse, le risque produit est-il acceptable ?

Si la réponse est floue :

- ne pas généraliser
- ne pas stabiliser
- ne pas sur-injecter

## Résumé ultra-court

- Le questionnaire sert à démarrer.
- Les expériences réelles valent plus que le questionnaire.
- Les faits précis valent plus que les généralisations.
- La mémoire doit aider le conseil, pas faire de la magie.
- Mieux vaut oublier que se tromper.
