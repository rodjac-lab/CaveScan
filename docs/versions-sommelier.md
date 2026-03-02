# Versions du Sommelier

## v2 — Chat conversationnel (actuel)
- **Commit** : `d843778` (2026-03-02)
- **Description** : Fil de discussion type chat. L'utilisateur tape en texte libre, Celestin repond avec un carousel par message. Chips de refinement (Plus audacieux, Plus classique, Moins cher).
- **Fichiers** : `CeSoirModule.tsx`, `Decouvrir.tsx`, `recommend-wine/index.ts`

## v1 — Carousel unique
- **Tag git** : `sommelier-carousel`
- **Commit** : `50eba72`
- **Description** : Un seul carousel de recommandations qui se remplace a chaque interaction. Chips de mode ("Ce soir je mange...", "Ce soir je bois...") + chips de refinement + champ de recherche togglable.

## Comment revenir a v1

```bash
# Option 1 : revert propre (cree un commit inverse, recommande)
git revert d843778

# Option 2 : voir les differences
git diff sommelier-carousel

# Option 3 : consulter l'ancien code sans changer de branche
git show sommelier-carousel:src/components/discover/CeSoirModule.tsx
```

**Note** : l'edge function `recommend-wine` a ete modifiee mais de facon retrocompatible. Un revert front-only fonctionne sans toucher au backend.
