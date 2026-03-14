# Celestin — Product Review V1

_2026-03-14 — Review direction produit_

---

## Vision validee

**Celestin EST le produit** — un sommelier IA personnel qui connait ta cave.
La cave est le contexte qui rend Celestin intelligent (et le painkiller qui justifie le prix).

```
CE QUE LES GENS CHERCHENT     CE QUI DIFFERENCIE          CE QUI RETIENT
(acquisition / WTP)            (activation)                (retention / moat)

"Gerer ma cave"           →   "Cette app a un             → "Celestin me connait,
                                sommelier IA !"               je ne peux plus m'en passer"

CAVE MANAGEMENT                CELESTIN                    MEMOIRE + PERSONNALISATION
= le painkiller                = le wow                    = le switching cost
= ce qu'ils paient             = ce qui differencie        = ce qui les garde
```

**Objectif** : produit commercial, utilisateurs payants.

---

## Architecture — Constats critiques

### CRITICAL
1. **Pas d'auth sur les edge functions** — n'importe qui avec l'anon key peut appeler celestin et bruler des credits LLM. Solution : auth in-function (verifier le JWT dans le code).
2. **Pas de suivi des couts LLM** — aucune visibilite sur la depense par user/jour. Risque financier si 50+ utilisateurs arrivent.
3. **RGPD non traite** — pas de mentions legales, pas de suppression de compte. Obligatoire legalement en France/EU avant lancement public.

### WARNINGS
- Single point of failure : tout depend de Supabase
- Pas de couche API propre (client parle directement a la DB)
- Memoire cross-session en localStorage (pas de sync cross-device)
- Zero tests automatises

---

## Error & Rescue — Gaps identifies

| Gap | Risque | Priorite |
|-----|--------|----------|
| Hallucinations LLM (faux domaines, faux faits) | Credibilite produit | Inherent — mitiger via prompt |
| Upload photo sans limite taille/format | Crash silencieux | P1 |
| localStorage plein ou corrompu | Perte memoire Celestin | P2 (resolu par migration Supabase) |
| Detection doublons en cave | Inventaire fausse | P2 |
| Historique Celestin illimite (cout tokens) | Cout LLM explosif | P1 |
| Messages utilisateur sans limite de longueur | Cout LLM | P1 |

---

## Security — Menaces

| Menace | Probabilite | Impact | Mitigue ? |
|--------|-------------|--------|-----------|
| Spam edge functions (couts LLM) | Haute | Haute | NON → auth in-function |
| RGPD non-conformite | Certaine | Haute | NON → mentions legales + suppression compte |
| Upload malveillant (non-image) | Moyenne | Faible | NON → validation taille/format |
| Injection prompt via cave | Moyenne | Moyenne | Partiel (responseSchema) |

---

## Code Quality — Dette identifiee

- **0 tests** (unit, integration, E2E)
- AddBottle.tsx : 1063 lignes, 3 flows imbriques
- BatchItemForm / BatchTastingItemForm : ~70% de code duplique
- Photo handling duplique entre 3 fichiers
- Debug.tsx : 701 lignes dev-only (pas critique)

---

## Observabilite — Inexistante

- Pas de suivi cout LLM par user
- Pas d'alertes
- Pas de dashboard
- Events tracking basique (table events) mais pas exploite

---

## GTM & Business — Non couvert par la review technique

### Questions ouvertes (a traiter separement)
- **Pricing** : quel modele freemium ? Quelle limite gratuite ?
- **Acquisition** : quels canaux pour les premiers 50 utilisateurs ?
- **Beta** : beta privee d'abord ? Combien de testeurs ?
- **Landing** : repositionner comme "Sommelier IA" ou garder "Gestionnaire de cave" ?
- **Communaute** : forums vin, Reddit, groupes Facebook vin ?
- **Contenu** : blog vin, SEO, social media ?
- **Partenariats** : cavistes, domaines, influenceurs vin ?
- **Metriques de lancement** : quels KPIs pour les 30 premiers jours ?

---

## Top actions avant lancement

### P0 — Bloquant
1. Auth in-function sur les edge functions
2. RGPD : mentions legales + suppression de compte
3. Suivi couts LLM (compteur dans events par user/jour)
4. Limiter historique Celestin + longueur messages (cap tokens)
5. Finaliser rebranding (dernieres references CaveScan)

### P1 — Premiere semaine
6. Freemium : quotas Celestin + integration Stripe
7. 3 tests E2E minimum (scan→encaver, scan→deguster, Celestin→reco)
8. Validation taille/format sur upload photo
9. Landing page repositionnee "Sommelier IA"
10. Onboarding : premier contact = Celestin

### P2 — Premier mois
11. Detection doublons a l'encavage
12. Migration memoire localStorage → Supabase
13. Message du jour Celestin (proactivite = retention)
14. Preferences explicites dans Reglages
15. Dashboard couts LLM basique
