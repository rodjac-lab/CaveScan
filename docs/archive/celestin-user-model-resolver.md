# User Model Resolver Celestin

## But

Le User Model Resolver est la couche qui transforme une memoire brute en un portrait utilisateur exploitable par Celestin.

Sans lui, le modele recoit :
- des faits a plat
- des sessions precedentes
- des souvenirs
- parfois des signaux contradictoires

Avec lui, le modele recoit :
- ce qui est stable chez l'utilisateur
- ce qui a change recemment
- ce qu'il faut eviter maintenant
- le bon style de guidage
- les souvenirs vraiment utiles pour le tour courant

## Principe

Le LLM ne doit pas decider seul, a chaque tour, quelle version de l'utilisateur est la bonne.

Le User Model Resolver fait ce travail avant le prompt principal.

Il est :
- deterministe
- peu couteux
- testable
- pilote par le type de conversation

## Entrees

Le moteur utilise :
- `user_memory_facts` actifs
- les summaries de sessions recentes
- le message courant
- le mode cognitif choisi par le Turn Interpreter

## Sortie

Il produit un bloc texte prioritaire :

- `Portrait utilisateur actuel`
- `Gouts a privilegier`
- `Evolutions recentes`
- `A eviter maintenant`
- `Contexte social ou temporaire`
- `Souvenirs mobilisables`

Ce bloc remplace l'injection plate des facts quand les donnees structurees sont disponibles.

## Vues memoire

Le moteur ne renvoie pas la meme memoire pour tous les tours.

- `greeting` / `social`
  Il garde un ton leger : cap actuel, tonalite utile, fil recent.

- `wine_conversation`
  Il privilegie progression, gouts stables, evolutions recentes, style de guidage.

- `cellar_assistant`
  Il privilegie gouts actuels, contre-signaux, contexte social, contexte temporaire, souvenirs utiles a la decision.

- `restaurant_assistant`
  Il reste sobre : preferences utiles a table, choses a eviter, contexte social.

- `tasting_memory`
  Il privilegie souvenirs signature, fils recents, changements de gout.

## Regles d'arbitrage

Le moteur applique 4 regles simples.

1. Les contextes temporaires actifs restent visibles jusqu'a expiration.
2. Un fait recent qui contredit un fait plus ancien cree une `evolution recente`.
3. Une aversion recente prime sur une ancienne preference sur le meme sujet.
4. Les doublons et quasi-doublons ne doivent pas se multiplier.

## Supersession

L'extraction d'insights continue a etre faite par LLM, mais l'application gere maintenant une partie de la coherence :

- detection des doublons
- detection des contradictions sur un meme sujet
- mise a jour de `superseded_by`

Cela evite qu'un utilisateur soit a la fois "amateur de blancs boises" et "fatigue par le boise" comme deux verites actives de meme niveau.

## Rafraichissement en session

Le portrait utilisateur ne doit pas attendre un reload.

Apres une extraction d'insights :
- les facts actifs sont recharges
- la memoire serializee est remise a jour
- les prochains tours utilisent la nouvelle version de l'utilisateur

## Pourquoi cette couche met Celestin au niveau premium

Le gain ne vient pas d'une memoire plus grosse.

Le gain vient d'une memoire plus juste.

Cette couche augmente 4 dimensions produit :
- coherence
- personnalisation utile
- prise en compte des changements
- sentiment "il me cerne"

## Fichiers

- `shared/celestin/user-model-resolver.ts`
- `src/lib/chatPersistence.ts`
- `src/components/discover/CeSoirModule.tsx`
- `supabase/functions/celestin/index.ts`
- `supabase/functions/extract-chat-insights/index.ts`
