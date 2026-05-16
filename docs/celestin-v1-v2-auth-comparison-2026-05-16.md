# Celestin — comparaison V1/V2 authentifiee

> Date : 2026-05-16.
> Compte test : `213e0662-2a6a-4868-957b-bbab982b342f`.
> Source contexte : donnees Supabase du compte test via JWT (`--auth`), pas la cave de la fixture locale.

## 1. Rapports compares

| Version | Commande | Rapport |
|---|---|---|
| V1 | `node scripts/scorecard-celestin.mjs --auth` | `evals/results/scorecard-2026-05-16T08-16-46-525Z.json` |
| V2 | `npm run scorecard:celestin:v2` | `evals/results/scorecard-v2-2026-05-15T22-04-33-244Z.json` |

Les deux runs utilisent les memes scenarios et le meme compte test. La fixture locale reste utilisee pour les scenarios/historiques, mais la cave, le profil et les souvenirs viennent de Supabase.

## 2. Resume executif

| Mesure | V1 auth | V2 auth | Lecture |
|---|---:|---:|---|
| Reponses scorees | 77 | 75 | V2 a plus de provider errors non scores |
| Score global | 97,6% | 98,8% | Gain positif mais pas decisif seul |
| Echecs totaux | 6 | 3 | V2 divise les echecs scores par 2 |
| Latence moyenne | 4309 ms | 3840 ms | V2 plus rapide |
| Latence p50 | 4147 ms | 3222 ms | V2 nettement plus rapide au median |
| Latence p95 | 8844 ms | 8395 ms | V2 legerement meilleure |
| RECOMMEND cartes valides | 14/16 | 26/26 | Gros signal V2, mais a nuancer |
| FACTS | 16 reponses, 0 echec | 15 reponses, 0 echec | Egalite fonctionnelle |

Conclusion courte : V2 est meilleure sur les metriques scorecard, surtout cartes et latence. Mais le score global ne suffit pas a justifier une bascule. Le detail montre aussi un risque V2 : elle peut afficher des cartes trop tot, meme quand le texte demande encore une precision.

## 3. Couverture et trous du scorecard

Les scenarios attendus representent 78 tours :

- 13 single-turn ;
- 31 conversations multi-tour ;
- 65 tours multi-turn ;
- total attendu : 78.

| Version | Tours attendus | Tours scores | Non scores |
|---|---:|---:|---:|
| V1 | 78 | 77 | 1 |
| V2 | 78 | 75 | 3 |

Les tours non scores correspondent a des provider errors filtres par le scorecard.

- V1 : `sushi` non score.
- V2 : `sushi` non score, plus la conversation `italy_red_no_grange_des_peres_contamination` interrompue au tour 1, ce qui retire les tours 1 et 2.

Implication : le score V2 est bon, mais les provider errors V2 restent a regarder. Ils ne sont pas comptabilises comme echecs dans le score global actuel.

## 4. Comparaison par capacite

| Capacite | V1 reponses | V1 echecs | V1 fallback | V1 p50/p95 | V2 reponses | V2 echecs | V2 fallback | V2 p50/p95 | Lecture |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| RECOMMEND | 25 | 2 | 2 | 4396 / 8844 | 26 | 0 | 6 | 4218 / 8395 | V2 gagne en cartes, mais fallback augmente |
| CHAT | 32 | 4 | 0 | 4343 / 8856 | 30 | 3 | 0 | 3024 / 8941 | V2 un peu meilleure, encore trop bavarde |
| ACTIONS | 4 | 0 | 0 | 3929 / 4673 | 4 | 0 | 0 | 2685 / 2947 | V2 plus rapide |
| FACTS | 16 | 0 | 0 | 4095 / 7900 | 15 | 0 | 0 | 2904 / 5826 | V2 plus rapide, meme exactitude |

Lecture principale :

- `FACTS` valide l'hypothese V2 sans encore prouver un gain qualitatif : 0 echec dans les deux versions, mais V2 est plus rapide.
- `RECOMMEND` est le vrai gain scorecard : V2 materialise des cartes valides sur tous les tours scorees.
- `CHAT` reste le point faible commun : les echecs sont surtout des reponses trop longues.
- `ACTIONS` est trop peu couvert pour conclure fortement.

## 5. Detail RECOMMEND

### V1

V1 a 2 echecs `c4_reco_cards_2_to_5` :

| Scenario | Tour | Message utilisateur | Cartes | Commentaire |
|---|---:|---|---:|---|
| `reco_3_turns` | 1 | `Tu en as en blanc plutôt ?` | 1 | Follow-up couleur, pas assez de cartes |
| `memory_reco_osso_bucco_no_cross_contamination` | 0 | `J'ai envie d'un rouge ce soir.` | 1 | Fallback response + une seule carte |

V1 a aussi 10 tours `RECOMMEND` sans `show_recommendations`, souvent parce qu'elle demande une precision avant de proposer.

### V2

V2 a 0 echec de cartes :

- 26 reponses `RECOMMEND` ;
- 26 `show_recommendations` ;
- 26/26 cartes dans la plage 2-5.

Mais cette reussite est ambivalente. Plusieurs reponses V2 affichent des cartes alors que le message texte est une clarification :

| Scenario | Message utilisateur | Texte assistant |
|---|---|---|
| `generic_tonight` | `Qu'est-ce que j'ouvre ce soir ?` | `Avant de te proposer quelque chose, dis-moi : tu manges quoi ce soir ?` |
| `reco_merci_culture` | `Qu'est-ce que j'ouvre ce soir ?` | `Avant de te proposer, il me faut un détail : tu manges quoi ce soir ?` |
| `reco_cancel` | `Qu'est-ce que je pourrais ouvrir ?` | `Je relance vite : c'est pour manger quoi ce soir, ou juste pour boire ?` |
| `reco_then_encavage` | `Qu'est-ce que j'ouvre ce soir ?` | `Avant de choisir, dis-moi : c'est pour manger quoi ce soir ?` |

Le scorecard actuel voit seulement que les cartes existent et sont valides. Il ne verifie pas encore si les cartes sont coherentes avec le texte. C'est un trou d'evaluation important.

Hypothese : le backfill V2 `minimumCards` est trop agressif. Il remplit les cartes meme sur une reponse de clarification. La bonne regle devrait probablement etre :

- si `responseMode = clarification`, pas de cartes ;
- si la demande est une vraie recommandation assez specifique, cartes obligatoires ;
- si la confiance est basse, clarification sans cards.

## 6. Detail CHAT

Les echecs `CHAT` sont des depassements de la limite `max_5_lines`.

### V1

4 echecs :

- `culture_questions`, tour 1 : Nebbiolo, 6 lignes ;
- `quality_no_season_parrot`, tour 2 : biodynamie, 6 lignes ;
- `quality_no_ah_opener`, tour 0 : Jura, 7 lignes ;
- `quality_no_ah_opener`, tour 2 : savagnin/traminer, 6 lignes.

### V2

3 echecs :

- `culture_questions`, tour 1 : Nebbiolo, 6 lignes ;
- `quality_no_ah_opener`, tour 0 : Jura, 16 lignes ;
- `quality_no_ah_opener`, tour 1 : vin jaune, 9 lignes.

Lecture : V2 ne degrade pas globalement `CHAT`, mais elle n'a pas encore resolu la verbosite. Un cas V2 est franchement trop long (`Jura`, 16 lignes), et il passe par `tool_response`, ce qui suggere un lien possible entre usage tool/context et reponse encyclopedique.

## 7. Latence

| Capacite | V1 p50 | V2 p50 | Gain V2 |
|---|---:|---:|---:|
| FACTS | 4095 ms | 2904 ms | -1191 ms |
| RECOMMEND | 4396 ms | 4218 ms | -178 ms |
| ACTIONS | 3929 ms | 2685 ms | -1244 ms |
| CHAT | 4343 ms | 3024 ms | -1319 ms |
| Global | 4147 ms | 3222 ms | -925 ms |

La latence est un vrai argument V2. Le gain est surtout visible sur `CHAT`, `FACTS` et `ACTIONS`. Sur `RECOMMEND`, le gain median est faible, et les fallbacks V2 peuvent encore produire des pics.

## 8. Signaux positifs V2

- Score global superieur : 98,8% vs 97,6%.
- Moins d'echecs scores : 3 vs 6.
- `RECOMMEND` : 0 echec de cartes scorecard.
- `FACTS` : 0 echec et meilleure latence.
- `ACTIONS` : 0 echec et meilleure latence.
- `CHAT` : moins d'echecs, p50 plus basse.
- Observabilite par capacite disponible pour comprendre les regressions.

## 9. Risques et limites V2

1. **Cartes trop agressives**
   V2 peut afficher des cartes alors qu'elle demande encore une precision. C'est probablement le point produit le plus important a corriger avant une bascule.

2. **Fallback RECOMMEND plus eleve**
   V2 a 6 fallbacks `RECOMMEND` contre 2 en V1. Meme si les cartes finales passent, cela signale encore une fragilite provider/contrat/runtime.

3. **Provider errors non scores**
   V2 a 3 tours non scores contre 1 en V1. Le score global doit etre lu avec cette limite.

4. **Evaluation encore mecanique**
   Le scorecard verifie des criteres utiles mais simples. Il ne juge pas encore la qualite de conseil personnel, la nuance, ni l'empathie.

5. **Cas "copain sommelier" absents**
   Les scenarios ne testent pas encore assez les recommandations avec contexte personnel : Marc, invites, preferences proches, souvenirs de diners.

## 10. Analyse des fallbacks V2 `RECOMMEND`

Les 6 fallbacks `RECOMMEND` V2 du run complet ont ete relus dans `celestin_turn_observability`.

| Scenario | Message | Cause premiere | Lecture |
|---|---|---|---|
| `marc_pizza` | `Ce soir dîner rapide avec Marc, pizza maison.` | Claude repond avec texte/clarification sans selection resolvable ; rejet contrat ; Gemini reussit avec 2 selections | Fallback cause par contrat trop strict |
| `memory_rome` | `Tu te souviens du chianti... Rome ?` | Claude repond honnetement "je ne retrouve pas" sans selection ; rejet contrat ; Gemini reussit sans selection mais V2 materialise quand meme des cartes | Mauvais routage/contrat : question memoire traitee comme reco |
| `new_red_selection_after_paella` | `Tu en as d autres, plutot en rouge ?` | Claude repond en texte libre avec recommandations nommees mais pas JSON/selection ; rejet contrat ; Gemini reussit | Contrat trop strict ou format provider fragile |
| `reco_refinement` | `Je cherche un vin pour ce soir` | Claude demande une precision sans selection ; rejet contrat ; Gemini timeout ; GPT repond clarification sans selection ; V2 backfill des cartes | Cas critique "clarification + cartes" |
| `memory_no_repeated_anchor` | `Ce soir c'est poulet rôti` | Claude 429 rate limit ; Gemini reussit | Bruit provider/rate limit, pas bug V2 |
| `quality_no_permission_seeking` | `Ce soir c'est raclette` | Claude produit un JSON + texte hors JSON et se corrige ; rejet ; Gemini reussit avec 1 selection puis backfill cartes | Contrat/format + backfill |

Synthese :

- 5/6 fallbacks viennent d'un rejet `Recommendation response contract violation: no resolvable ui_action or recommendation_selection`.
- 1/6 est un vrai probleme provider Claude 429.
- 1 fallback inclut aussi un timeout Gemini avant succes GPT.
- Plusieurs reponses rejetees de Claude etaient conversationnellement acceptables, mais sans selection structuree.

Conclusion technique : le probleme principal n'est pas "Gemini sauve Claude parce que Claude est mauvais". Le probleme est que V2 demande parfois une selection structuree dans des tours ou une clarification ou une reponse memoire honnete serait meilleure.

Correction probable :

1. Si `responseMode = clarification`, ne pas exiger de `recommendation_selection`.
2. Si le provider repond par une clarification sans cards, accepter le texte et ne pas backfill.
3. Si la demande est vraiment `closed_choice`, garder l'exigence de selection et de cards.
4. Si la question est d'abord une memoire (`Tu te souviens du chianti...`), ne pas la traiter comme `RECOMMEND` par defaut ; elle devrait probablement passer en `FACTS`/memoire ou `CHAT` selon les sources disponibles.
5. Ajouter une assertion scorecard : pas de `show_recommendations` quand le message assistant demande une precision.

Cette analyse renforce le point precedent : V2 est prometteuse, mais son backfill et son contrat `RECOMMEND` sont actuellement trop agressifs sur les tours ambigus.

## 11. Decision provisoire

V2 est sur la bonne voie, mais le run detaille ne justifie pas encore une bascule par le seul score global.

Decision recommandee :

1. garder V2 comme prototype derriere flag ;
2. corriger ou au moins mesurer le probleme "clarification + cartes" ;
3. analyser les 6 fallbacks `RECOMMEND` V2 ;
4. ajouter des scenarios de recommandation personnelle ;
5. refaire la comparaison V1/V2 apres ces ajouts.

Le critere de bascule devrait devenir :

> V2 remplace V1 si elle gagne sur `RECOMMEND` reel, `FACTS`, latence, fallback, et qualite de contexte personnel, sans afficher de cartes quand elle est encore en train de clarifier.
