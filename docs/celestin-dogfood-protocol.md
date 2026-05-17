# Celestin — protocole dogfood

> Statut : protocole court pour la stabilisation V2 avant decision d'adoption.
> Objectif : apprendre vite sur de vraies conversations sans transformer chaque incident isole en refactor.

## But

Le dogfood doit repondre a une question simple :

> V2 donne-t-elle une meilleure experience personnelle, avec moins de fragilite, sur un compte reel ?

Les scores automatises restent utiles, mais ils ne suffisent pas. Les conversations reelles doivent etre relues avec les traces backend.

## Regle d'usage

- Utiliser le compte personnel quand le but est de tester l'intimite utilisateur.
- Activer V2 dans `/debug`.
- Ne noter que les conversations qui semblent :
  - conversationnellement fausses ;
  - trop longues ou trop froides ;
  - trop generiques par rapport au profil ;
  - trop personnelles sans source claire ;
  - lentes sans raison evidente ;
  - cassees par un fallback, une carte inattendue ou une action incorrecte.

## Note minimale a fournir

Quand une conversation est a relire, noter seulement :

- date ;
- heure locale approximative ;
- ce qui semblait rate ;
- si la reponse finale s'est rattrapee ou non.

Exemple :

```text
17/05 17h34 — question plat avec Champagne.
Il s'en sort, mais reponse trop generique. Pas bloquant.
```

## Commande d'audit

Pour relire les conversations V2 dogfood recentes :

```bash
npm run dogfood:celestin
```

Autour d'une heure precise :

```bash
npm run dogfood:celestin -- --around 2026-05-17T17:34:00+02:00
```

Options utiles :

- `--hours 12` : limiter aux 12 dernieres heures ;
- `--around <datetime>` : chercher autour d'un instant ;
- `--window-min 45` : agrandir la fenetre autour de l'instant ;
- `--session <uuid>` : relire une session precise ;
- `--all-sources` : inclure autre chose que `dogfood_v2` ;
- `--full-messages` : afficher des extraits plus longs ;
- `--json` : exporter les donnees brutes.

Le script lit :

- `celestin_turn_observability` pour le routage, les capabilities, la latence, les tools, les fallbacks ;
- `chat_messages` pour le transcript persiste.

Il requiert soit :

- `SUPABASE_SERVICE_ROLE_KEY` pour un audit admin complet ;
- ou `CELESTIN_ADMIN_EMAIL` / `CELESTIN_ADMIN_PASSWORD` pour se connecter comme admin.

`TEST_USER_EMAIL` / `TEST_USER_PASSWORD` fonctionne aussi si cet utilisateur a le droit de lire les donnees ciblees. Les traces admin et les transcripts ne doivent pas etre lisibles par un client public.

## Scorecard dogfood

Les scenarios dogfood sont exclus des runs standards pour ne pas melanger stabilisation V2 et futurs chantiers produit.

Pour les inclure explicitement :

```bash
npm run scorecard:celestin:v2 -- --dogfood
```

Ces cas couvrent pour l'instant :

- preferences d'un proche dans une recommandation ;
- preference utilisateur explicite ;
- pairing inverse `vin -> plat`.

Ils servent a mesurer et documenter les limites avant les chantiers `User Model / User Graph` et `Pairing Engine`, pas a forcer V2 a les resoudre par petits hacks.

## Triage

Chaque incident doit etre classe avant correction :

- `routing` : mauvaise capacite ou mauvais mode de reponse ;
- `memory` : souvenir absent, mauvais, contamine ou trop fragile ;
- `recommendation` : cartes absentes/inattendues, shortlist mauvaise, clarification incorrecte ;
- `action` : fiche, encavage, degustation ou ui_action incorrecte ;
- `tone` : trop long, brutal, froid, scolaire, ou pas assez personnel ;
- `latency` : lenteur sans complexite visible ;
- `truth` : hallucination ou nom personnel non source.

## Politique de correction

- Corriger vite les bugs produit evidents : fallback visible, JSON brut, action incorrecte, hallucination sourcee nulle part.
- Ne pas corriger par cas lexical isole.
- Ajouter a la scorecard uniquement les cas qui representent un usage plausible et repetable.
- Mettre en backlog les sujets structurels : User Model, personnes/proches, accords bidirectionnels, outil de nettoyage memoire.

## Sortie attendue

Apres quelques sessions :

1. liste courte des incidents classes ;
2. corrections ciblées si necessaire ;
3. decision : garder V1 par defaut, etendre le dogfood V2, ou lancer le refactor V2.
