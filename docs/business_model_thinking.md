# Modèle économique Celestin — réflexion en cours

Document de travail. Pas une décision figée — synthèse des arbitrages discutés
pour reprendre la conversation sans rederouler le raisonnement de zéro.

Dernière mise à jour : 2026-04-29.

## Direction privilégiée

**Trial 2 mois full premium → paywall obligatoire + sub annuelle préférentielle.**

Pas un freemium éternel. La gratuité est un **outil de conversion**, pas un état
stable. Après le trial, soit le user paie, soit il sort (ou tombe dans un mode
de rétention très limité, à définir).

### Pourquoi ce modèle plutôt que freemium illimité

- Le coût LLM par user free n'est pas dramatique (~$0.13-1.56/an) mais **les
  signups morts qui n'utilisent jamais bouffent de la complexité opérationnelle**
  (analytics, support, infrastructure) sans jamais convertir.
- Un trial fini force le moment de décision. Sans deadline, beaucoup de users
  restent en limbo "j'utilise un peu, je verrai bien".
- L'expérience pendant le trial = la **démo de l'app payante**. Donc on ne
  dégrade rien pendant le trial (pas de feature manquante, pas de modèle LLM
  inférieur). Sinon le user teste un Celestin moins bon que le payant et se
  désinvestit.

## Décisions actées

### 1. Claude Haiku 4.5 pour TOUS les users (trial + paid)

Pas de routing "Gemini sur free, Claude sur paid". Raisons :

- Le surcoût Claude pendant le trial est trivial : ~$0.26/user/2 mois (avec
  cache). C'est notre **CAC implicite LLM** — ridicule comparé à du CAC payant
  ($5-30/signup en B2C standard).
- L'expérience trial doit être la meilleure possible pour maximiser la
  conversion. Mettre du Gemini économise $0.10/user mais peut tuer 5-10 points
  de conversion. Mauvais arbitrage.
- Argument psychologique fort : "ce que tu testes, c'est ce que tu auras en
  payant". Pas de bait-and-switch.

### 2. Pas de quotas restrictifs pendant le trial

Le user doit pouvoir vivre la valeur **complète** pour décider en connaissance
de cause. Quotas = signal de défiance, anti-conversion.

(Quotas peuvent intervenir APRÈS expiration du trial pour des users qui ne
paient pas mais qu'on garde en rétention long-tail — à débattre.)

## Pricing — sweet spot identifié

| Prix | Comparables | Conv. réaliste | Net annuel/100 signups |
|---|---|---|---|
| $4.90/mois | Cellartracker $4.17 | 20% | ~$1 119 |
| **$6.90/mois** | café+croissant | 18-20% | **~$1 599** |
| **$8.90/mois** | demi-carafe resto | 15-18% | **~$1 868** |
| $11.90/mois | bouteille basique | 10-12% | $1 669 |

Calculs basés sur Claude+cache, trial 2 mois, ~100 users-cohort.

**Sweet spot estimé** : **$7-9/mois mensuel**, avec offre annuelle à -25 à -30%.

À $4.90, on sous-pricing pour quoi ? Un verre de vin = sub trop modeste pour
positionner un produit haut de gamme avec une expérience IA différenciée.

### Sub annuelle — levier majeur

Exemple à $6.90/mois : annuel à $59 = **-29%** (vs $82.80 si mensuel).

Avantages :
- **Cash front-loaded** : meilleur cashflow startup
- **Switching cost croissant** : plus le user entre de bouteilles, plus quitter
  Celestin = perdre son cellier numérique. L'inertie joue pour la rétention.
- **Decision fatigue** : 1 décision/an au lieu de 12. Moins de churn passif.
- **Proposition simple** : "tu as eu tes moments magiques pendant le trial, 2
  mois c'est pas mal, prends l'année à -30% c'est sans douleur."

### Risque renouvellement annuel

Le **seul moment dangereux** de l'année : le rebill automatique. Sans rituel
de pre-renewal, on s'expose à :
- Chargebacks
- Mauvaises reviews ("Celestin abonnement piège")
- Désabonnement frustré qui se raconte autour

**Mécanique standard à mettre en place** :
- Email J-30 avant rebill : "Voici ton année Celestin en chiffres : 47
  bouteilles encavées, 32 dégustations, 8 souvenirs gardés. Renouvellement
  dans 30 jours."
- Mention claire "renouvellement automatique" à la souscription (obligation
  légale UE).
- Le but : faire **revivre la valeur** + ouvrir l'option de désabonner sans
  surprise.

KPI clé : **rétention annuelle**, pas churn mensuel.

## CB-timing — choix structurant du funnel

Question majeure encore ouverte : à quel moment on demande la CB ?

### Modèle A : CB à l'inscription (avant le trial)

Le user rentre sa CB pour démarrer le trial. À J+60, rebill auto.

- **Pros** : conversion à expiration 50-80% (inertie), filtrage positif à
  l'entrée, cashflow auto, anti-fraude.
- **Cons** : top-of-funnel massacré (5-15% inscription), perception "ils
  veulent ma CB avant que j'aie testé ?".

### Modèle B : CB en fin de trial

Le user utilise gratuitement, on lui demande la CB à J+60.

- **Pros** : top-of-funnel maximal (20-40% inscription), honnêteté perçue,
  qualité du sample converti.
- **Cons** : conversion à expiration 5-15% (acte actif requis), pas de
  cashflow auto, free riders multi-comptes faciles.

### Modèle C (hybride) : CB au pic d'engagement

Trial démarre librement (sans CB). À un moment-clé du parcours user
(5e bouteille en cave, ou 3e conv chat), popup : "Tu kiffes ? Sécurise tes
2 mois sans interruption en mettant ta CB. Premier rebill seulement à J+60."

- **Pros** : combine volume top-of-funnel + conversion auto, capture la CB
  au high d'engagement.
- **Cons** : plus complexe à orchestrer (timing, copy).

### Repères empiriques (B2C SaaS)

| Modèle | Conv inscription | Conv trial→paid | Net revenue/100 visiteurs |
|---|---|---|---|
| A (CB upfront) | 8% | 60% | ~$280-560 |
| B (CB at end) | 30% | 10% | ~$175-300 |
| C (CB au pic) | 25% | 35% | ~$510-720 |

### Recommandation phasée pour Celestin

**Phase 1 (lancement, 0-500 users)** : **Modèle B**.
- Besoin de volume pour dogfood, feedback, premiers témoignages, word-of-mouth
- Avec cache LLM, 100 users free coûtent ~$26 sur 2 mois — investissement
  marginal pour acquérir des testeurs
- App pas encore connue : demander la CB upfront ferait fuir 70-80% des
  candidats
- Wine enthusiast = profil engagé, conversion à J+60 défendable avec bon
  email J-7/J-3/J-1

**Phase 2 (post-PMF, conversion validée >15%)** : transition vers **Modèle C**.
- Introduire la mécanique "sécurise tes 2 mois" au pic d'engagement
- Si user accepte : bascule en modèle A pour son trial
- Sinon : reste sur le parcours B classique
- Fermeture progressive du funnel sans tuer l'acquisition

**À éviter pour le lancement** : Modèle A pur. Coupe 70% du top-of-funnel,
rallonge la mise à PMF.

## Mécaniques d'engagement / conversion

### Trial-at-first-qualified-action (vs trial-at-signup)

Démarrer le compteur 2 mois à la **première action qui crée de la valeur
durable**, pas à l'inscription. Trois triggers possibles :

- Premier **scan** de bouteille (création d'une entrée en cave)
- Premier **message envoyé à Celestin** (consomme du LLM, génère du
  compiledProfileMarkdown à terme)
- Première **fiche dégustation manuelle** (création d'un tasting)

Le seul état "gratuit indéfini" est l'exploration UI pure (parcourir les
pages, lire l'onboarding, regarder les démos), sans interaction qui
consomme du LLM ou crée de la donnée persistante.

⚠️ Trou évité : si on déclenchait UNIQUEMENT sur le premier scan, un user
pourrait chatter avec Celestin pendant des années sans payer. Or le chat
est précisément le coût LLM le plus élevé. Donc inclure le chat comme
trigger.

Pourquoi cette mécanique :
- Filtre positif : les users qui n'arrivent jamais à une action qualifiée
  (juste téléchargement + clic puis abandon) ne consomment pas de trial.
- Le trial actif ne court que sur des users déjà engagés → meilleure
  conversion sur le dénominateur réel.

Précédents marché : Notion (premier doc créé), Linear (premier issue),
Calendly (première invitation envoyée). Bonne pratique modern SaaS
d'aligner le compteur sur l'**activation**, pas le signup.

Variante optionnelle — **mini-quota d'exploration** : 3 messages chat
gratuits + 1 scan gratuit avant que le compteur démarre. Au-delà, "🎉 Ton
essai 2 mois commence maintenant." Évite l'effet "piégé dès le premier
hello". À calibrer si on voit des abandons précoces dans le funnel.

Risque : communication. Popup explicite au franchissement du seuil pour
que le user comprenne que son compteur démarre.

### Hooks d'acquisition

#### Bonus +1 mois si import Vivino

Idée Rodol 2026-04-29. Le user qui importe sa cave Vivino (potentiellement 50+
bouteilles d'un coup) :
- Vit un **moment de wow puissant** ("toute ma cave est là, instantanément")
- A un **switching cost immédiat** déjà investi dans Celestin
- Est probablement un **wine enthusiast confirmé** (ICP idéal)

Coût supplémentaire LLM : ~$0.13/user de bonus. Ridicule vs la valeur attendue.

L'import Vivino est déjà au backlog (P1, "Import concurrent mobile-first :
CellarTracker puis Vivino"). À enrichir avec le hook marketing : passer de
"feature technique" à "feature + carrot conversion".

#### Autres hooks possibles à explorer (pas encore débattus)

- **Code parrainage** : un user converti partage un lien → l'invité bénéficie de
  +1 mois de trial, le parrain bénéficie de -1 mois sur la prochaine facture.
  Mécanique connue (Dropbox, Notion).
- **Bonus si premier souvenir partagé** : Celestin a une mécanique de partage
  ("Partage avec CaveScan/Celestin"). Un user qui partage est un ambassadeur.
- **Bonus si avis App Store** : risqué côté ASO/conformité Apple, à creuser.

## Levers identifiés (et leur impact)

| Levier | Impact estimé | Effort |
|---|---|---|
| Activer prompt cache Anthropic | -50% sur cost LLM main call | 30 min code (backlog P1) |
| Pricing $7 vs $4.90 | +43% revenue/converted | 0 (juste une décision) |
| Sub annuelle à -30% | +cashflow + rétention | Stripe config |
| Trial-at-first-scan | +5-10pt conversion estimé | 1-2j frontend + analytics |
| Import Vivino + bonus 1 mois | acquisition channel + activation forte | déjà au backlog, à prioriser |
| Email J-30 pre-renewal | -churn renewal | infra emailing + cron |

## Risques à anticiper

- **Hard paywall = friction massive** sur l'acquisition. Beaucoup d'utilisateurs
  abandonnent avant même de voir le paywall. Solution si conversion trop basse :
  freemium **avec quotas très restrictifs** post-trial (ex : 1 conv/sem, 10
  bouteilles max) plutôt que tout-ou-rien.
- **Pas d'effet réseau** dans Celestin (vs Vivino qui est social). On convertit
  sur la **valeur perso unique**, donc le trial doit être ultra-bien orchestré
  pour faire vivre la valeur. Mécaniques type "moment de magie forcé" à
  designer (souvenir rappelé au tour 5, debrief post-dégustation, message du
  jour, etc.).
- **Subscription fatigue 2026** : les users sont saturés d'abonnements. L'angle
  annuel à -30% est précisément la mitigation, mais à valider.
- **Ratio conversion 18-20% est ambitieux**. Industry B2C standard : 2-5%. Apps
  niches engagées : 8-15%. Si on tombe à 10%, le compte d'expl reste positif
  ($800/100 signups à $7/mois) mais la croissance ralentit.

## Open questions

- **Quel rétention long-tail post-trial pour les non-payants ?** Tout-ou-rien ou
  freemium-quota ? À débattre.
- **Lifetime deal one-shot ?** Type "$199 lifetime" pour les early adopters.
  Front-loaded cash mais pas de revenue récurrent. Réservé aux 100 premiers
  users typiquement.
- **Stripe vs RevenueCat** ? Vu que c'est une PWA + future iOS app, RevenueCat
  simplifie le multi-platform. Stripe reste le plus simple pour la PWA pure.
- **Territoires** : tarification adaptée par pays (PPP) ? Beaucoup de SaaS le
  font (Stripe Smart Pricing). Pas urgent au lancement.

## Comparables marché (référence)

| App | Modèle | Prix |
|---|---|---|
| Vivino | Freemium gratuit (revenue = social commerce wine sales) | — |
| Cellartracker | Donations / sub optionnelle | ~$50/an = $4.17/mois |
| Delectable Pro | Sub | $5-8/mois |
| Hello Vino | Free + ads | — |
| Wine Spectator | Magazine sub | ~$50/an |
| **Celestin (proposé)** | **Trial 2 mois → sub** | **$7-9/mois ou $59-79/an** |

Celestin se positionne **au-dessus** des comparables niche car valeur
différenciante (Celestin IA conversationnel + cellier structuré + mémoire
compilée). Défendable si l'expérience tient ses promesses.

## Coûts de référence (LLM only) — CIBLE

**Ces chiffres restent l'objectif à atteindre par optimisation.** Ils ne
décrivent pas la réalité actuelle (cf. section "Erreur identifiée" ci-dessous).

Calculs détaillés dans `docs/llm-comparison-2026-04-29.md`. Synthèse pour ce
modèle économique :

| Configuration | Coût/user actif/mois | Coût/user actif/an |
|---|---|---|
| Claude (aujourd'hui, sans cache) | $0.26 | $3.12 |
| **Claude + cache Anthropic activé** | **$0.13** | **$1.56** |
| Trial 2 mois + cache | — | **$0.26 par signup** |

Coût LLM = ~3% du prix annuel ($1.56 sur $59). Reste 97% pour Supabase, Vercel,
infra, dev, support, marketing. Sain économiquement.

## Erreur identifiée — coûts réels mesurés (2026-05-01)

La projection ci-dessus était **fausse de 3-5×** sur le volume de calls par
question, et la facture Anthropic du 1er mai (1.45 USD pour une matinée de
dogfood d'un seul user) l'a révélé. **Les coûts/call étaient corrects ; ce qui
manquait dans la projection : les sources de calls multiples.**

### Origine du gap (par ordre d'impact)

1. **Tool-use double les calls Celestin** : les tours factuels (recommandation,
   inventaire, mémoire) génèrent 2 calls Claude au lieu de 1 (round 1 = decide
   tool, round 2 = formuler la réponse avec les résultats du tool). Représente
   ~50% des tours user. Multiplie le volume chat par ~1.5-2.

2. **Prefetch reco automatique au mount d'App** (supprimé 2026-05-01 par codex).
   Avant suppression : 1 prefetch × 2 calls Claude par mount d'App. Sur un user
   qui ouvre l'app 3-5 fois/jour, ça pouvait représenter 30-40% du coût.

3. **Edges secondaires non comptabilisées** : `extract-chat-insights` (1 call
   par session terminée), `patch-user-profile` (occasionnel), `scorecard-judge`
   (eval, à filtrer du coût production). Soit ~10-15% du coût.

4. **Cache miss `tool_followup`** : sur les tours factuels, le 2e call (avec
   tool_results injectés et `tools` array absent) **rate systématiquement le
   cache** créé par le 1er call (parce que `tools` fait partie du préfixe cache
   Anthropic). Surcoût d'environ 25-30% sur les tours factuels.

### Estimation actuelle (2026-05-01, post-suppression du prefetch)

Pour un user actif normal en production (~11 questions/sem) :

- ~17 calls chat/sem (avec tool-use ×1.5)
- + 1-2 extract-chat-insights/sem
- + ~0.5 patch-user-profile/sem
- = ~19 calls/sem × 4 sem × $0.0055 = **~$0.42/user actif/mois**

Soit **3× la cible**, mais bien moins que les ×10 observés en dogfood intense.

### Validation par mesure réelle (2026-05-01 11:14 UTC)

Test propre : 4 questions user (mix smalltalk + 2 factuelles avec tool-use),
prefetch déjà supprimé.

Mesures Anthropic Activity Log :

- **6 calls Claude** (ratio 1.5 calls/question, conforme à l'estimation)
- 42 071 tokens input total, 475 tokens output total
- Coût estimé de cette conv : **~$0.030** (selon hit cache effectif)
- Soit **~$0.0075/question** (vs $0.058/question hier en dogfood pré-suppression)
- **Réduction d'un facteur 7-8** vs hier — confirme que le prefetch était LE
  vrai coupable de l'explosion observée le 30 avril.

Extrapolation user actif normal : confirme l'estimation **~$0.40/user/mois**.
Marge brute LLM à $7/mois : **94%**, à $9/mois : **95%**. Sain.

### Plan pour rapprocher la réalité de la cible

Trois leviers identifiés, à coder dans l'ordre :

| Priorité | Levier | Gain estimé | Effort |
|---|---|---|---|
| 1 | **Fix cache `tool_followup`** | -25-30% sur tours factuels (~-15% global) | 1-2h |
| 2 | **Cap history conversation à 6 turns** (vs 12 actuellement) | -10-15% sur input non-cached | 30 min |
| 3 | **Compacter tool results** (`tasting_note` slice 500→150 chars) | -15% sur round 2 factuel | 30 min |
| 4 | **Persister `[anthropic-usage]` dans une table Postgres** | observabilité continue (pas un gain direct) | 1h |
| 5 | **Mesurer en production réelle** (pas dogfood) | sortir du biais dev intensif | protocole utilisateur normal |

Avec les 3 premiers leviers cumulés : estimation à **~$0.20-0.30/user actif/mois**,
toujours au-dessus de la cible $0.13 mais en bonne voie.

### Impact sur le compte d'exploitation

Les compte d'exploitation plus haut dans ce doc utilisent toujours la **cible
$0.13/user/mois**. Ils restent **valides comme objectifs** et permettent de
piloter le développement. La marge brute LLM réelle 2026-05-01 est de
**~88-92%** (vs 95% projeté), toujours saine pour le modèle freemium-trial à
$7-9/mois. À surveiller : si la réalité décroche durablement au-delà de
$1/user/mois, le compte d'expl mérite révision.

### Ce que ça change sur la stratégie

Rien de fondamental. La direction (trial 2 mois → paywall + sub annuelle, prix
$7-9/mois, full Claude pour tous, pas de Gemini sur free) reste valide. Le
prefetch supprimé enlève déjà une grosse partie du gap. Le fix cache
`tool_followup` enlèvera le reste. Aucun pivot business model nécessaire.
