# Plan — Simplifier le contrat de recommandation Celestin

> **Statut** : plan (pas encore implémenté). Objectif : remplacer le contrat strict actuel "tu DOIS produire `recommendation_selection`, sinon échec total" par un principe simple "send what you have, drop what you don't".

---

## 1. Contexte

### Symptôme observé (session dogfood 2026-05-07, replay 2026-05-08)

Sur la phrase de Rodol *"Ça sera au restaurant... un blanc un peu sec... tu peux me dire ce que c'était ?"* :
- Le router classe en `recommendation_request` (faux positif `accord` dans `d'accord` + `un blanc` cumulés). Fix tactique commit `3e3e086` (2026-05-08) sur le mot-clé `accord`, mais c'est un patch.
- Le contrat strict force Claude à produire une `recommendation_selection`. La phrase n'étant pas une vraie demande de reco, Claude produit du texte conversationnel valide mais aucune selection résolvable.
- La porte de validation rejette → cascade providers → message d'erreur visible : *"Désolé, je suis momentanément indisponible"*.

### Diagnostic structurel

8-9 mécanismes coopèrent sur cette zone :

1. **Turn-interpreter** : route = `recommendation_request`
2. **ContextPlan** : `cellarCandidates = preempted`, `tools = none`
3. **SourceResolver** : préchargement de candidats
4. **Prompt** : *"tu DOIS produire `recommendation_selection`"* (`prompt-context-policy.ts`, `context-builder.ts`)
5. **Validation porte** (`runtime.ts:391-412`) : rejette si pas de selection résolvable
6. **Escape hatch** (`canAcceptRecommendationClarification`, `runtime.ts:58`) : 4 conditions cumulées pour pardonner
7. **Multi-provider fallback** (`llm-providers.ts:585`) : Haiku → Gemini → GPT-4.1 si rejet
8. **Response-policy** (`response-policy.ts`) : strip `ui_action` si pas autorisé
9. **`ensureRecommendationUiAction`** (`recommendation-action.ts:249`) : reconstruit le `ui_action` depuis la selection si Claude l'a oublié

Quand un cas tombe entre les mailles, aucun maillon ne sait qu'il aurait dû rattraper. L'opportunité = simplifier en passant.

---

## 2. Principe directeur

> **Send what you have, drop what you don't.**

La présence ou l'absence de cards utilisables détermine ce qu'on envoie au frontend. Pas de rejet, pas de cascade automatique, pas d'escape hatch sophistiqué. Le contrat strict actuel devient un **encouragement** dans le prompt (Claude *peut* produire une selection si pertinent), et la response-policy s'occupe de la matérialisation finale.

**Conséquence** : un faux positif du router devient invisible côté UX. Le user reçoit le texte de Claude — qui est presque toujours pertinent même quand le routing s'est trompé. Le multi-provider fallback est conservé pour les vraies pannes (réseau, timeout, quota), pas pour masquer des contrats violés.

---

## 3. Changements par fichier

### 3.1 `runtime.ts` (orchestrateur principal)

**Suppressions** :
- `canAcceptRecommendationClarification` (lignes 58-72) — devenu inutile, le texte est toujours acceptable.
- La string d'erreur `'Recommendation response contract violation: no resolvable ui_action or recommendation_selection'` (ligne 408).

**Modification** : la fonction `validateResponse` passée à `celestinWithFallback` (lignes 391-412) ne renvoie **plus de string d'erreur sur violation de contrat reco**. Elle reste utile pour signaler les vraies pannes (provider qui ne renvoie pas de JSON parsable, etc.). En clair :
- Avant : retourne `'Recommendation response contract violation...'` si ni cards ni clarification → throw côté provider → cascade.
- Après : retourne `null` (toutes réponses valides syntaxiquement sont acceptées). La logique de matérialisation est déplacée en aval dans `applyResponsePolicy` ou `ensureRecommendationUiAction`.

**Nouveau** : un appel à un module de matérialisation finale (déjà partiellement présent via `ensureRecommendationUiAction` lignes 429-436) qui décide :
- Si la response a une selection résolvable ET le route est une route reco → matérialise les cards.
- Sinon → strip le `ui_action`, garde le texte tel quel.

### 3.2 `recommendation-action.ts`

**Conservation** :
- `canResolveRecommendationUiAction` (ligne 225) — sa logique reste utile pour décider *"peut-on matérialiser des cards ?"*. Mais elle ne sert plus de gardien du rejet ; elle informe la matérialisation.
- `buildCardsFromSelection`, `hasResolvableBottleIds`, `hasStructuredBottleIds` — utilitaires conservés.

**Modification** : `ensureRecommendationUiAction` (ligne 249) devient le **seul point de matérialisation des cards**. Sa logique actuelle est déjà proche du bon comportement : si pas de selection résolvable, retourne la response sans `ui_action`. À simplifier :
- Supprimer la branche dépendante de `requireStructuredSelection` (devient toujours optionnel).
- Supprimer la reconstruction "depuis le message texte" (`buildRecommendationCards`) qui est un mécanisme de récupération acrobatique — si Claude n'a pas produit de selection, on n'invente pas des cards depuis le texte, on les strip.

### 3.3 `response-policy.ts` (55 lignes, petit fichier)

**Modification** : étendre `applyResponsePolicy` pour qu'elle **s'occupe explicitement** du strip des artefacts structurels invalides. Aujourd'hui elle strip `ui_action` si `interpretation.shouldAllowUiAction === false`, mais elle ne touche pas à la `recommendation_selection`. Nouveau :
- Si `recommendation_selection` est présente mais non résolvable → la mettre à `null`.
- Si `ui_action.kind === 'show_recommendations'` mais pas de cards utilisables → strip le `ui_action`.

**Bénéfice** : un seul module canonique pour le nettoyage final, plus deux fonctions séparées (`applyResponsePolicy` + `ensureRecommendationUiAction`).

### 3.4 `prompt-context-policy.ts` et `context-builder.ts` (le prompt LLM)

**Modification du ton du prompt** :
- Avant : *"DOIT produire `recommendation_selection`"*, *"obligatoire"*, *"ne propose pas une bouteille hors liste"*, etc.
- Après : *"si l'utilisateur demande une recommandation, choisis 1 à 3 `bottle_id` parmi les candidats. Si la demande n'est pas claire ou si tu préfères demander une clarification, réponds simplement en texte sans `recommendation_selection`."*

Effet : moins de pression contractuelle, plus de marge pour Claude pour répondre conversationnellement quand la phrase l'appelle.

**Note** : on garde la directive *"ne propose pas une bouteille hors de la shortlist"* (sécurité importante).

### 3.5 `llm-providers.ts:585` (`celestinWithFallback`)

**Pas de changement structurel.** La cascade Haiku → Gemini → GPT-4.1 reste en place, mais maintenant elle n'est plus déclenchée par des violations de contrat reco. Elle n'est déclenchée que par les vraies erreurs (parse JSON, timeout, panne réseau) — ce qui est son rôle légitime.

Conséquence latence : ~5-15s de moins en cas d'ancien faux positif (plus de cascade inutile).

---

## 4. Stratégie de tests

### 4.1 Tests existants à conserver / mettre à jour

- **`response-policy.test.ts`** : ajouter des cas où le `ui_action` ou la `recommendation_selection` doivent être strippés.
- **`runtime-contract.test.ts`** : retirer les tests qui asserteraient *"violation de contrat → erreur"*. Remplacer par *"violation de contrat → texte propre, ui_action strippé"*.
- **`recommendation-action.test.ts`** : `canResolveRecommendationUiAction` devient une fonction informationnelle, vérifier qu'elle retourne le bon booléen sans plus dépendre de l'idée de rejet.
- **`turn-interpreter.test.ts`** : pas de changement, le router n'est pas touché.

### 4.2 Nouveaux tests à ajouter

- **Test de régression sur la phrase de Rodol du 2026-05-07** : input = la phrase "Ça sera au restaurant... un blanc... tu peux me dire ce que c'était ?", route = `recommendation_request` simulé, expectation = `ui_action = undefined`, `recommendation_selection = null`, `message` non vide.
- **Test sur le scenario `question_after_recommendation`** : input = la fixture eval, expectation = `ui_action = undefined` (au lieu de l'actuel `show_recommendations`).
- **Test de non-régression sur une vraie demande de reco** : *"Recommande-moi un vin pour un poulet rôti"*, expectation = `ui_action = show_recommendations` avec cards correctes.

### 4.3 Tests de bout en bout (eval auth)

Lancer `EVAL_AUTH=1 RUN_LLM_EVAL=1 npm run eval:celestin` après le refactor. Cibles :
- `question_after_recommendation` doit passer.
- Aucune régression sur les scenarios qui passent aujourd'hui (40/44).
- `quality_concise_responses` peut rester en échec (orthogonal, drift verbosité Haiku).

---

## 5. Validation manuelle

### 5.1 Replay des cas connus

Après déploiement de l'edge function :

1. **Rejouer la phrase de Rodol du 7/05** via `/tmp/replay-drift.mjs` (existe déjà). Attendu : réponse texte propre, pas de message d'erreur, latence < 6s.
2. **Rejouer le scenario `question_after_recommendation`** via le runner d'eval. Attendu : `ui_action = undefined`, `cards count = 0`, message texte cohérent.
3. **Rejouer une vraie demande de reco** (*"Que boire ce soir avec un poulet rôti"*). Attendu : `ui_action = show_recommendations` avec 1-3 cards, comme aujourd'hui.

### 5.2 Dogfood Rodol

Le test ultime : Rodol fait une session dogfood réelle ce weekend. Aucun message *"Désolé, je suis momentanément indisponible"* visible. Latence inchangée sur les vraies recos. Qualité conversationnelle préservée ou améliorée.

---

## 6. Risques et mitigations

| Risque | Probabilité | Mitigation |
|---|---|---|
| Régression silencieuse : Claude arrête de produire des selections sur de vraies recos | Faible | Tests d'eval qui vérifient `ui_action = show_recommendations` sur les vraies demandes. Le prompt encourage toujours la selection, juste sans punir l'absence. |
| Le prompt assoupli rend Claude trop bavard sur les recos (moins de cards, plus de texte) | Moyenne | Surveiller en eval : si la génération de cards baisse, durcir un peu le prompt. C'est un dial réversible. |
| `ensureRecommendationUiAction` mal simplifiée casse un cas existant (ex: bottle_id résolu hors-shortlist) | Faible-moyenne | Tests sur `recommendation-action.test.ts` à enrichir avant le refactor. Faire les modifs incrémentales. |
| Les anciens fallback messages d'erreur étaient en fait utiles dans certains cas (ex: vraie panne) | Très faible | Le multi-provider fallback reste actif pour les vraies erreurs (parse, timeout, quota). Seules les violations de contrat reco ne déclenchent plus la cascade. |

---

## 7. Ordre d'implémentation

Refactor incrémental, chaque étape testée avant la suivante.

### Étape 1 — Refonte de `applyResponsePolicy`
- Étendre `response-policy.ts` pour strip `recommendation_selection` et `ui_action.show_recommendations` quand non résolvable.
- Ajouter un import vers `canResolveRecommendationUiAction` depuis `recommendation-action.ts`.
- Tests unitaires : `response-policy.test.ts` enrichi.

### Étape 2 — Simplifier `ensureRecommendationUiAction`
- Retirer la branche `requireStructuredSelection`.
- Retirer la reconstruction depuis le message texte.
- Tests : `recommendation-action.test.ts` mis à jour.

### Étape 3 — Désactiver le rejet dans `runtime.ts:391-412`
- `validateResponse` retourne `null` au lieu de string d'erreur sur violation de contrat reco.
- Garder la validation pour les vraies erreurs (response invalide JSON, etc.).
- Supprimer `canAcceptRecommendationClarification` (lignes 58-72).
- Tests : `runtime-contract.test.ts` mis à jour.

### Étape 4 — Assouplir le prompt
- `prompt-context-policy.ts` : remplacer *"DOIT produire"* par *"choisis si pertinent"*.
- `context-builder.ts` : idem.
- Snapshots prompts (`prompt-builder.test.ts`, `context-builder.test.ts`) à mettre à jour avec `npx vitest -u`.

### Étape 5 — Validation
- `npm run verify` (lint + build + unit + e2e flows).
- `npm run eval:celestin` avec `EVAL_AUTH=1 RUN_LLM_EVAL=1`.
- Replay des 3 phrases connues (drift Rodol, scenario eval, vraie reco).

### Étape 6 — Déploiement
- Deploy edge function : `npx supabase functions deploy celestin --project-ref flqsprbdcycweshvrcyx --no-verify-jwt`.
- Replay live des 3 phrases pour validation post-deploy.
- Commit avec message clair sur le refactor.

### Étape 7 — Dogfood Rodol weekend
- Une session réelle. Vérifier qu'aucun message d'erreur visible n'apparaît même quand le router se trompe.

---

## 8. Métriques de succès

| Métrique | Aujourd'hui | Cible après refactor |
|---|---|---|
| Pass rate eval auth | 95% (40-42/44) | ≥ 95% (la couverture du scenario `question_after_recommendation` passe en plus) |
| Lignes de code dans la zone reco | ~600 sur les 4 fichiers principaux | ≤ 500 (suppression escape hatch + simplification ensureUiAction) |
| Mécanismes distincts à raisonner | 9 | 6 (escape hatch supprimé, validation reco supprimée, ensureUiAction fusionné dans response-policy) |
| Messages d'erreur user visibles sur faux positifs router | 1 par drift (cas du 7/05) | 0 (texte propre toujours envoyé) |
| Latence cas faux positif | ~8s (cascade providers) | ~3-5s (pas de cascade) |

---

## 9. Effort estimé

- **Étapes 1-4 (code)** : ~2 jours
- **Étape 5 (validation)** : ~½ jour
- **Étape 6 (déploiement)** : ~½ jour
- **Étape 7 (dogfood)** : weekend Rodol

Total : ~3-4 jours dev + dogfood weekend.

---

## 10. Décisions actées (2026-05-08)

1. **Pas de retry wine_conversation** ✅ acté. Quand le contrat reco est violé, on accepte le texte de Claude tel quel. Pas de 2ᵉ call LLM. Plus simple, probablement suffisant.

2. **Logger les strip de selection** ✅ acté. Dans `observability.ts`, ajouter un champ `selectionStripped: true` quand la response-policy strip une selection invalide. Permet de mesurer la fréquence des drifts router en prod sans visibilité utilisateur.

3. **Préserver le hook `applyConversationalIntent`** ✅ acté. Garder les ~10 lignes inactives. C'est la rampe de lancement si l'option C devient nécessaire plus tard. Coût quasi nul.

## 10bis. Cadrage projet acté (2026-05-08)

- **Scope** : option A simplifiée complète (les 7 étapes de la section 7).
- **Timing** : démarrage après le dogfood weekend (10-11 mai). Le dogfood servira aussi à mesurer la fréquence réelle des drifts visibles user — données utiles pour valider l'urgence et calibrer les tests.
- **Stratégie de commits** : plusieurs commits par étape (1 par étape de la section 7), pas un commit atomique. Plus traçable, rollback granulaire si nécessaire.

---

## 11. Suite possible (hors scope ce plan)

Si l'option A simplifiée tient en prod sur 2-4 semaines mais qu'on observe que les routings backend faussés posent problème pour les analytics ou le tuning prompt, on enchaînera sur l'option C (rebrancher un mini-classifier LLM sur le hook `conversationalIntent` existant). Le présent plan ne préempte pas cette suite.

---

## 12. Documentation à mettre à jour

Le refactor casse plusieurs passages dans la doc actuelle. À traiter dans la même PR que le code, sinon les nouveaux développeurs seront mal informés.

### 12.1 `docs/celestin-architecture.md` (le plus impacté)

Passages obsolètes après refactor :

- **Ligne 14 du flow ascii** (`L'utilisateur RESPONSE POLICY ensuite computeNextState`) : enrichir pour mentionner que la response-policy fait désormais le strip des artefacts non résolvables (cards, selection).
- **Lignes 154-225 — pipeline d'exécution** : la séquence reste valide mais ajouter un encadré sur le passage `applyResponsePolicy` qui peut désormais strip les artefacts structurels invalides.
- **Lignes 427-430 — table des routes** : la colonne *"Claude choisit 1-3 `bottle_id` dans `recommendation_selection`"* devient *"Claude PEUT choisir 1-3 `bottle_id` ; si la phrase ne s'y prête pas, il répond en texte sans selection. La response-policy strip les cards non matérialisables."*.
- **Lignes 462-511 — section response_format** : le commentaire sur `recommendation_selection` doit indiquer *"optionnel — si non fourni ou non résolvable, la response-policy strip les cards"* au lieu de laisser entendre une obligation.
- **Section sur `canResolveRecommendationUiAction`** (s'il y en a une) : sa fonction n'est plus de gardien du rejet mais d'informateur du strip.
- **Suppression** de toute mention de `canAcceptRecommendationClarification` (fonction supprimée).

### 12.2 `CLAUDE.md` (instructions projet)

- **Ligne 14 — flow architectural condensé** : enrichir *"Response Policy (garde-fous déterministes post-LLM)"* en ajoutant *"strip les `ui_action` et `recommendation_selection` non résolvables au lieu de rejeter la réponse — principe send what you have, drop what you don't"*.

### 12.3 `docs/celestin-routing-context-refactor-plan.md`

C'est le plan historique de mise en place du contrat strict (avril 2026). Plusieurs passages obsolètes (lignes 31, 102, 142, 144, 165, 174, 203, 242, 263, 265).

Approche recommandée : **ne pas réécrire le doc**, ajouter en tête une note d'archivage :

```
> **2026-05-08 — partiellement remplacé** : la contrainte forte sur `recommendation_selection`
> décrite dans ce plan a été simplifiée. Voir `docs/archive/celestin-recommendation-contract-simplification-plan.md`
> pour le nouveau principe "send what you have, drop what you don't".
> Ce document reste utile pour comprendre l'historique de mise en place du contrat initial.
```

C'est cohérent avec le pattern utilisé pour `docs/archive/` (autres plans historiques préservés sans réécriture).

### 12.4 `docs/archive/celestin-routing-diagrams.md` (créé 2026-05-08)

Les deux schémas actuels (chaîne actuelle vs option C) restent pertinents comme **état avant refactor**. Après le refactor :

- Renommer la section "Chaîne actuelle" en "Chaîne avant refactor (avant 2026-05-08)".
- Ajouter une troisième section "Chaîne après refactor" qui montre le flow simplifié : pas de cascade providers sur violation contrat, response-policy comme point unique de matérialisation, escape hatch supprimé.

### 12.5 `docs/backlog.md`

- **Sous "Celestin — Cout & Latence"** ou section similaire : ajouter une entrée *"Simplification du contrat de recommandation"* avec lien vers ce plan, statut `[x]` une fois livré.
- **Item #2 (Drift cards `question_after_recommendation`)** : marquer couvert par ce chantier — la simplification fait disparaître la classe entière des "drift cards visibles user".

### 12.6 Mémoire personnelle (`~/.claude/projects/.../memory/`)

À mettre à jour à la fin du chantier (étape 6 ou 7) :

- **`etat_actuel.md`** : section "Reste à faire" — retirer item #2 (drift cards), ajouter mention du refactor livré.
- **Nouveau fichier `archi_send_what_you_have.md`** (optionnel mais recommandé) : note de doctrine sur le principe *"send what you have, drop what you don't"*, à invoquer la prochaine fois qu'on hésite à ajouter un mécanisme de validation strict + cascade.
- **Mise à jour `archi_celestin_matching_voies.md`** : pas directement impacté mais ajouter une référence croisée vers le nouveau plan.

### 12.7 Tests doc

- **`docs/testing-strategy.md`** (si elle décrit le contrat) : vérifier qu'il n'y a pas de mention obsolète du *"contrat strict obligatoire"*. Si oui, ajuster.

### 12.8 Stratégie d'application

Pour ne pas oublier la doc :

1. **Mettre la mise à jour doc dans la même PR que le code.** Pas de PR séparée — le risque est qu'on oublie ou qu'on doublonne.
2. **Ordre dans la PR** : code d'abord, tests, snapshots, **puis** doc en dernière étape avant le commit final. Comme ça la doc reflète vraiment le code livré, pas une intention.
3. **Checklist** dans le commit message ou la description PR :
   - [ ] `celestin-architecture.md` à jour
   - [ ] `CLAUDE.md` à jour
   - [ ] `docs/archive/celestin-routing-diagrams.md` à jour
   - [ ] `celestin-routing-context-refactor-plan.md` annoté en tête
   - [ ] `backlog.md` à jour
   - [ ] Mémoire personnelle à jour
