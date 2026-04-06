# Celestin Memory Review

## Objectif

Ce document synthétise notre réflexion produit sur la mémoire de Celestin avant toute V1 de consolidation type `autodream`.

Ce n'est pas une spec d'implémentation.
C'est un document de cadrage pour décider :

- ce que la mémoire doit faire dans le produit
- ce qui est central vs secondaire
- ce qui doit être simplifié avant d'ajouter une nouvelle couche système

## Cadrage produit

Celestin ne gagnera pas contre ChatGPT comme assistant conversationnel généraliste.

En revanche, Celestin peut devenir meilleur comme **conseiller vin personnel** parce qu'il connaît :

- la cave de l'utilisateur
- ses goûts
- ses souvenirs vécus
- le fil de la relation

La mémoire n'est donc pas un bonus cosmétique.
Elle est un pilier du moat produit.

Mais cette mémoire n'a de valeur que si elle améliore :

- la justesse des conseils
- la personnalisation
- la crédibilité
- la sensation de relation

La mémoire ne doit pas servir à "faire magique".
Elle doit servir à mieux conseiller.

## Doctrine produit

### Ce que l'utilisateur doit ressentir

Un utilisateur dira "Celestin me connaît vraiment" si Celestin est capable de rappeler, au bon moment, un fait ou un souvenir réellement important.

Exemple :

- un excellent repas à Rome avec sa femme et sa fille
- des spaghetti
- un Chianti parfaitement accordé
- éventuellement le nom du restaurant ou du vin

La valeur ne vient pas d'un rappel fréquent.
La valeur vient d'un rappel :

- rare
- précis
- émotionnellement juste
- contextuellement pertinent

### Hiérarchie des effets mémoire recherchés

Ordre de priorité produit exprimé :

1. se souvenir des moments
2. garder le fil des échanges
3. se souvenir des goûts

Cette hiérarchie ne veut pas dire que les goûts sont peu importants.
Elle veut dire que la relation perçue se construit d'abord par les moments et la continuité.

### En recommandation

Dans une recommandation parfaite :

- la priorité absolue est la justesse contextuelle
- la mémoire n'est pas là pour décorer
- un souvenir ne doit être cité que s'il justifie ou renforce le conseil

Bon exemple :

- "Tu me disais la semaine dernière avoir très envie de blancs du Mâconnais en ce moment, alors je te propose un Pouilly-Fuissé sur ce poulet rôti."

Mauvais exemple :

- rappeler systématiquement Rome dès qu'on parle de vin italien

### Péché produit principal

Le pire échec pour Celestin est :

- **il se trompe**

Donc la règle mémoire fondamentale est :

- mieux vaut oublier que mal rappeler
- mieux vaut sous-activer la mémoire que produire une mémoire fausse ou forcée

## Vision cible

Celestin doit être un conseiller vin personnel supérieur aux alternatives parce qu'il combine :

- la cave
- les goûts
- les souvenirs
- la continuité de relation

La bonne formule est :

- la cave donne le terrain de jeu
- les goûts donnent la direction
- les souvenirs donnent la profondeur
- la continuité conversationnelle donne la relation

## Cartographie du système actuel

### 1. Cave

- Rôle : base factuelle de conseil
- Valeur produit : critique
- Fonction : contraindre les recommandations et éviter les hallucinations
- Risque : données incomplètes ou mal exploitées
- Verdict : pilier absolu

### 2. `user_memory_facts`

- Rôle : stocker préférences, aversions, contexte, intentions, signaux durables
- Valeur produit : critique pour améliorer le conseil
- Fonction : rendre la recommandation plus personnelle que générique
- Risques :
  - accumulation
  - redondance
  - contradiction
  - formulation vague
  - profil faux ou aplati
- Verdict : pilier critique, mais qui a besoin d'hygiène

### 3. Souvenirs de dégustation

- Rôle : rappeler des expériences vécues, accords marquants, vins mémorables
- Valeur produit : très forte
- Fonction :
  - créer l'attachement
  - enrichir les recommandations quand le lien est direct
  - rendre Celestin réellement personnel
- Risques :
  - souvenir forcé
  - faux positif retrieval
  - rappel décoratif
  - répétition
- Verdict : pilier différenciant

### 4. Continuité conversationnelle

- Rôle : garder le fil du dialogue
- Valeur produit : très forte
- Fonction : rendre l'échange naturel et vivant
- Dépend de :
  - mémoire
  - turn interpreter
  - conversation state
  - routing
  - prompting
- Risque : attribuer à la mémoire des problèmes qui relèvent en fait du système conversationnel global
- Verdict : pilier d'usage, mais pas strictement "une couche mémoire"

### 5. `previousSessionSummaries`

- Rôle : relier légèrement une session à la suivante
- Valeur produit : moyenne
- Fonction : offrir une continuité légère
- Risques :
  - résumé trop vague
  - contexte parasite
- Verdict : couche de soutien, pas couche dominante

### 6. `retrievedConversation`

- Rôle : rappeler précisément une conversation passée
- Valeur produit : forte
- Fonction : retrouver un échange antérieur explicite
- Risques :
  - mauvais retrieval
  - conversation trop longue ou peu pertinente
- Verdict : forte valeur quand déclenché explicitement

### 7. `resolvedUserModel`

- Rôle : synthétiser les signaux en portrait utilisateur
- Valeur produit : potentiellement forte
- Fonction : rendre le modèle plus efficace avec un portrait condensé
- Risques :
  - aplatir les nuances
  - surcouche difficile à raisonner
  - concurrence avec les souvenirs bruts et les facts
- Verdict : utile si très discipliné

## Diagnostic global

Le système actuel n'est pas pauvre.
Au contraire, il est déjà riche.

Le risque principal n'est donc pas "manque de mémoire".
Le risque principal est :

- trop de couches qui parlent en même temps
- hiérarchie implicite plutôt qu'explicite
- mémoire riche mais parfois trop diffuse

En d'autres termes :

- nous avons déjà beaucoup de briques
- mais leur orchestration produit n'est pas encore assez stricte

## Hiérarchie mémoire par type de tour

### Questions de souvenir

Priorité :

1. souvenirs de dégustation
2. conversation passée récupérée
3. session summaries
4. memory facts généraux

Règle :

- exactitude > richesse
- ne jamais compléter au-delà de ce qui est effectivement disponible

### Recommandation

Priorité :

1. contexte immédiat + cave
2. goûts / préférences / évitements utiles
3. un souvenir maximum, seulement s'il renforce le conseil

Règle :

- la mémoire doit servir la décision
- elle ne doit pas détourner la recommandation de sa mission

### Culture vin

Priorité :

1. connaissance générale
2. mémoire personnelle quasi absente

Règle :

- ne pas ramener artificiellement une question générale à l'utilisateur

### Encavage / dégustation

Priorité :

1. état du tour
2. informations structurées du vin
3. intentions liées à la cave si utiles

Règle :

- pas de mémoire émotionnelle inutile

## Ce qu'il faut simplifier avant autodream

Avant de construire une consolidation mémoire V1, il faut clarifier les points suivants :

### 1. Hiérarchie des couches

Le système doit rendre explicite :

- quelle couche est principale selon le type de tour
- quelle couche est secondaire
- quelles couches doivent être coupées

### 2. Budget mémoire par tour

Il faut éviter que plusieurs couches concurrentes soient injectées simultanément sans hiérarchie claire.

Question clé :

- quelle mémoire aide réellement ce tour précis ?

### 3. Place exacte des `user_memory_facts`

Les facts sont centraux pour la qualité du conseil.
Mais ils ne doivent pas devenir :

- un profil hypertrophié
- une mémoire plate
- une source de confiance injustifiée

### 4. Place du `resolvedUserModel`

Le portrait synthétique doit aider le jugement.
Il ne doit pas remplacer la texture réelle des souvenirs ou écraser des nuances importantes.

## Position sur une V1 autodream

Une V1 de consolidation mémoire fait sens.
Mais elle doit être conservative.

### Oui

- oui à une consolidation des `user_memory_facts`
- oui à une amélioration de l'hygiène mémoire
- oui à une réduction du bruit et des contradictions

### Non

- non à une machine trop ambitieuse dès la V1
- non à la suppression hard-delete comme mécanisme principal
- non à la sur-automatisation si la hiérarchie produit n'est pas encore claire

### Principe directeur

La consolidation doit améliorer la qualité du conseil.
Pas seulement rendre la table plus propre.

## Orientation recommandée

Avant toute implémentation `autodream`, l'ordre recommandé est :

1. clarifier l'usage mémoire par type de tour
2. discipliner les couches actives selon le contexte
3. ensuite seulement consolider les `user_memory_facts`

## Résumé exécutif

- La mémoire est un pilier du produit Celestin
- Elle n'est pas un gadget conversationnel
- Elle sert à produire un conseil vin supérieur parce qu'il est personnel
- Le système actuel a déjà beaucoup de briques
- Le problème principal est désormais la hiérarchie et la discipline d'usage
- Une V1 `autodream` est pertinente, mais seulement sous une forme conservative et au service de la qualité du conseil
