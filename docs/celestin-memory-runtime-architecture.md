# Celestin Memory Runtime Architecture

## But

Fixer l'architecture mémoire cible de Celestin en version simple, maintenable et orientée LLM.

## Idée centrale

Celestin doit séparer deux problèmes différents :

1. stocker et interroger les faits bruts
2. donner au LLM une connaissance durable et compacte de l'utilisateur

Ces deux problèmes n'ont pas besoin du même format.

## Architecture cible

```text
Supabase
(cave, degustations, notes, conversations, faits bruts)
        |
        v
Profil compile unique
(Markdown stocke en base)
        |
        v
Runtime
= profil compile + requetes SQL ciblees
        |
        v
Reponse Celestin
```

## Avant / apres

```text
AVANT
sources brutes
+ questionnaire
+ facts
+ resumes
+ retrieval conversationnel
+ souvenirs de degustation
-> plusieurs couches memoire en parallele
-> prompt charge
-> LLM

APRES
sources brutes
-> profil compile utilisateur
-> tasting memories ciblees
-> SQL cible si besoin
-> prompt plus simple
-> LLM
```

```text
RUNTIME LEGACY
message
+ history
+ cave
+ tasting memories
+ resolved model
+ memory facts
+ previous sessions
+ questionnaire
-> LLM

RUNTIME ACTUEL
message
+ history
+ conversationState
+ cave
+ tasting memories
+ profil compile
-> LLM
```

## 1. Supabase : les sources brutes

Supabase reste la source de vérité pour les données opérationnelles.

On y garde :

- la cave
- les bouteilles
- les dégustations
- les notes
- les scores
- les conversations archivées
- les facts et signaux bruts

Ces données servent à répondre à des questions exactes ou événementielles.

Exemples :

- `qu'ai-je bu le 26 février ?`
- `ai-je déjà bu du Barolo ?`
- `quels vins ont été associés à l'osso bucco ?`
- `qu'ai-je bu à Rome ?`

Le bon outil ici est :

- SQL ciblé
- éventuellement enrichi par un peu d'extraction structurée

## 2. Profil compilé : la connaissance durable de l'utilisateur

Le LLM ne lit pas du SQL.
Il lit du texte.

Donc la connaissance durable sur l'utilisateur doit être stockée sous une forme optimisée pour lui :

- compacte
- lisible
- hiérarchisée
- maintenue dans le temps

Le bon support V1 est :

- un document Markdown unique par utilisateur
- stocké en base dans `user_profiles.compiled_markdown`

Ce document n'est pas la base brute.
C'est une mémoire compilée.

## Sections du profil compilé

Version actuelle (V2, avril 2026) — 6 sections. Les 2 dernières sont **omises si vides**, pour éviter d'injecter des headers sans contenu.

- `Profil gustatif` — appellations, domaines, accords, descripteurs, preferences, aversions, extraits du questionnaire
- `Moments marquants` — jusqu'à 8 dégustations notables avec note tronquée à 400 caractères
- `Explorations en cours` — pistes récentes de dégustation + `wine_knowledge` + `life_event` (rendus comme "Jalon personnel : ...")
- `Entourage et partages` — facts `social` sur l'entourage et les compagnons de dégustation (nouvelle section)
- `Contexte et intentions` — `context` non expirés (préfixés `[contexte récent]`) + `cellar_intent` (nouvelle section)
- `Style de conversation` — ton attendu, niveau technique, règles conversationnelles

## Comment les `user_memory_facts` alimentent le profil

7 catégories extraites par `extract-chat-insights` : `preference`, `aversion`, `wine_knowledge`, `life_event`, `social`, `cellar_intent`, `context`.

Sélection au moment de la compilation (`shared/celestin/compiled-profile.ts`) :

- **Scoring** : `score = confidence × (0.6 + 0.4 × recency_decay)` où `recency_decay = 0.5 ^ (ageDays / halfLifeDays)`. La confidence garde minimum 60% du poids — un fait récent mais peu sûr ne détrône jamais un fait ancien très sûr juste par fraîcheur.
- **Demi-vies par nature** : `context` 30j, `cellar_intent` 90j, `wine_knowledge` 180j, `social` 270j, `preference`/`aversion` 365j, `life_event` 540j. Un contexte de voyage vieillit vite ; une préférence de goût pas.
- **Seuils de confiance minimum** : 0.5 pour `context`, 0.6 pour `wine_knowledge`, 0.65 pour `social`, 0.7 pour les autres. Les facts en dessous sont écartés avant sélection (lutte contre les inférences hasardeuses de l'extraction).
- **Quotas serrés par catégorie** : 5 préférences, 3 aversions/wine_knowledge/social, 2 life_event/cellar_intent/context. Au-delà, on tranche par score décroissant.
- **Facts temporaires** : autorisés seulement pour `context` et `cellar_intent`, uniquement s'ils ne sont pas expirés. Les `context` temporaires sont préfixés `[contexte récent]` dans le Markdown pour signaler au LLM leur volatilité.

## 3. Runtime minimal

Le runtime mémoire de Celestin doit rester simple.

Il lit :

- le profil compilé
- la cave et l'état conversationnel courant
- quelques résultats ciblés sur les dégustations passées
- des requêtes SQL ciblées selon la question

Il n'a pas besoin d'une couche complexe de retrieval généraliste si les responsabilités sont bien séparées.

En pratique, le runtime actuel ressemble à :

```text
message courant
+ history courte
+ conversationState
+ cave
+ tasting memories ciblees
+ profil compile
-> LLM
```

## Quand utiliser le profil compilé

Le profil compilé sert surtout pour :

- comprendre les goûts durables
- personnaliser le conseil
- garder la mémoire longue de la relation
- adapter le ton et le niveau de détail

Exemples :

- `il aime les blancs tendus mais se fatigue du boisé`
- `moment fondateur à Rome sur spaghetti et Chianti`
- `explore en ce moment le Sangiovese et le Brunello`
- `préfère un ton direct, sans trop de jargon`

## Quand utiliser SQL ciblé

Le SQL ciblé sert surtout pour :

- retrouver un événement précis
- retrouver un vin précis
- retrouver un groupe d'expériences
- répondre à une question de cave

Exemples :

- vins bus le `26 février`
- bouteilles liées à `osso bucco`
- vins bus à `Rome`
- meilleurs `Brunello` dégustés

Dans le code actuel, la récupération des dégustations utiles passe par `tastingMemories` :

- filtres exacts quand ils existent
- ranking local lisible
- secours sémantique seulement si rien de plausible n'est déjà trouvé

## Ce qu'on évite avec cette architecture

- un retrieval à la volée trop sophistiqué
- des couches de ranking difficiles à raisonner
- des tables compilées multiples qui finissent re-sérialisées en texte
- un questionnaire qui continue à dominer l'expérience réelle

## Hiérarchie des sources

Quand plusieurs sources existent, l'ordre de priorité doit être :

1. signal explicite du tour en cours
2. événements et expériences réelles en base
3. profil compilé
4. questionnaire initial, seulement comme bootstrap

Le questionnaire ne doit plus dominer dès qu'on a de vrais signaux vécus.

## Pourquoi ce design est bon pour un LLM

Parce qu'il donne au modèle deux choses très différentes, chacune dans le bon format :

- des faits exacts, récupérés par requêtes ciblées
- un portrait utilisateur compact, lisible, déjà maintenu

Le LLM n'a pas à reconstruire l'utilisateur à partir d'un vrac de sources.

## Résumé

```text
Donnees brutes et evenements -> Supabase
Connaissance durable utilisateur -> Markdown compile en base
Runtime -> profil + tasting memories + SQL cible
```

## Règle finale

Le système mémoire de Celestin ne doit pas chercher à être impressionnant.

Il doit être :

- simple
- explicable
- juste
- maintenable

La complexité doit vivre dans la compilation, pas dans un runtime surchargé.
