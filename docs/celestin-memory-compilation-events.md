# Celestin Memory Compilation Events

## But

Définir quand le profil compilé d'un utilisateur doit être mis à jour, et sous quelle forme.

Le principe central est simple :

- on ne compile pas parce que "quelque chose a été dit"
- on compile parce que "quelque chose de durable a probablement été appris"

## Objet mis à jour

Le profil compilé est un document Markdown unique stocké en base.

Table V1 proposée :

- `user_profiles.user_id`
- `user_profiles.compiled_markdown`
- `user_profiles.updated_at`
- `user_profiles.version`
- `user_profiles.last_compiled_from_event_at`
- `user_profiles.last_compilation_reason`
- `user_profiles.compilation_status`

Le profil V1 contient 4 sections :

- `Profil gustatif`
- `Moments marquants`
- `Explorations en cours`
- `Style de conversation`

## Règle générale

On compile plus facilement :

- des faits spécifiques
- des retours explicites
- des moments marquants

On compile moins facilement :

- des généralisations larges
- des choix ponctuels
- des besoins du moment

Exemples :

- oui : `A adoré le Rodolfo Cosini 2020 sur un osso bucco`
- oui : `A trouvé le Sanlorenzo 2007 trop évolué`
- non trop vite : `Aime les rouges italiens évolués`

## Trois catégories d'événements

### 1. Toujours compiler

Ces événements doivent presque toujours déclencher une proposition de patch.

- dégustation notée avec commentaire qualitatif
- retour explicite sur une recommandation de Celestin
- préférence ou aversion nouvelle formulée clairement et de manière générale
- moment marquant clairement verbalisé

Exemples :

- `J'ai adoré`
- `Pas du tout`
- `Je crois que j'aime la Syrah plus que le Pinot`
- `Ce Chianti à Rome avec ma femme et ma fille, moment parfait`

### 2. Compiler si le LLM juge que le signal est durable

Ces événements ne doivent pas déclencher automatiquement un patch.
Ils déclenchent un check léger.

- conversation longue avec exploration d'un sujet
- contradiction avec le profil actuel
- première mention d'une région, d'un cépage ou d'un style jamais vu
- intérêt récurrent mais encore faible

Exemples :

- plusieurs tours sur le Jura, les vins nature ou les accords
- le profil dit `aime les vins évolués` mais l'utilisateur dit `trop évolué pour moi`
- première vraie curiosité pour le Nebbiolo ou le Chenin

### 3. Ne jamais compiler

Ces événements ne doivent pas déclencher de mise à jour du profil.

- questions factuelles sur la cave
- demandes opérationnelles
- sessions courtes sans signal personnel
- conversations abandonnées
- hors sujet vin
- choix ponctuels de tour

Exemples :

- `Combien j'ai de bouteilles ?`
- `À quelle température servir un Chablis ?`
- `Plutôt un rouge`
- `Ce soir`

## Détection

Le système doit fonctionner en deux temps.

### A. Détection de candidats

Pendant la session, le système peut lever des `candidate_signals`.

Un `candidate_signal` est un drapeau léger du type :

- `rated_tasting_with_comment`
- `explicit_reco_feedback`
- `new_general_preference`
- `profile_contradiction`
- `long_topic_exploration`
- `new_topic_first_seen`

Cette étape doit être simple et prudente.

### B. Check léger de compilation

À la clôture d'une session, on ne lance pas systématiquement une mise à jour.

On lance un check léger seulement si :

- au moins un `candidate_signal` a été levé
- ou la session dépasse un seuil de richesse

Le check léger reçoit :

- la conversation utile
- le profil compilé actuel
- les signaux candidats

Et répond :

- `no_change`
- ou un patch minimal

## Format du patch

Le patch doit être borné.
Pas de réécriture libre du profil à chaque session.

Opérations autorisées en V1 :

- `add`
- `edit`
- `remove`

Chaque patch doit préciser :

- la section cible
- le changement exact
- la justification courte

Exemple conceptuel :

```json
{
  "action": "add",
  "section": "Explorations en cours",
  "content": "- Explore le Brunello et le Sangiovese avec intérêt, mais rejette les versions trop évoluées.",
  "reason": "Deux dégustations récentes et un retour explicite convergent."
}
```

## Réécriture complète

Le profil ne doit pas être réécrit à chaque fois.

Mais il doit être consolidé périodiquement pour éviter :

- l'accumulation de micro-ajouts
- les contradictions latentes
- les répétitions
- un profil trop long

Déclencheurs possibles :

- tous les `20` patchs
- ou environ `1 fois par mois`

Objectif de la réécriture complète :

- compacter
- dédupliquer
- reformuler proprement
- garder le profil court et lisible

## Principes de sécurité

- mieux vaut ne pas compiler que compiler un faux signal
- mieux vaut un fait précis qu'une généralisation trop large
- mieux vaut corriger une contradiction que l'ignorer
- les moments marquants doivent rester rares
- `Moments marquants` doit rester petit : `5 à 10` max en V1

## Résumé opérationnel

```text
Conversation / degustation / feedback
        |
        v
Detection de candidate_signals
        |
        v
Check leger seulement si necessaire
        |
        v
Patch minimal du profil compile
        |
        v
Reecriture complete periodique
```

## Heuristique finale

La bonne question n'est pas :

- `faut-il memoriser cette session ?`

La bonne question est :

- `avons-nous appris quelque chose de durable sur cette personne ?`
