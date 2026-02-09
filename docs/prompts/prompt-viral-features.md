# CaveScan — Fonctionnalités Viralité

## Contexte

On ajoute deux leviers de croissance organique à CaveScan :
1. Une section "Inviter vos amis" dans les Réglages
2. Une signature "Partagé avec CaveScan" en footer de chaque message de partage de dégustation

Réfère-toi au mockup HTML joint (`mockups-final.html`) pour le rendu visuel exact.

## Stack rappel

React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui. PWA mobile-first. Design system CaveScan (Playfair Display + DM Sans, accent `#B8860B`).

---

## Tâche 1 — Refonte Settings.tsx

### Ce qui change

L'écran Réglages doit être **réorganisé** dans cet ordre de haut en bas :

#### 1. Section "Inviter vos amis" (NOUVEAU)
- Carte avec icône dorée (cercle gradient `#B8860B` → `#D4A843`, icône Send/Paper-plane en blanc)
- Titre : **"Invitez vos amis"** (Playfair Display, 17px, bold)
- Description : "Partagez CaveScan avec les amateurs de vin autour de vous" (DM Sans, 13px, light, `text-secondary`)
- Bouton CTA pleine largeur : **"Envoyer une invitation"** avec icône Share/Upload
  - Background accent `#B8860B`, texte blanc, `border-radius: 10px`
- Au clic, appeler `navigator.share()` avec :
  ```typescript
  navigator.share({
    title: 'CaveScan',
    text: 'Je gère ma cave avec CaveScan. Scanne tes étiquettes, encave, et partage tes dégustations. Essaie !',
    url: 'https://cavescan.vercel.app'
  })
  ```
- Fallback si `navigator.share` n'est pas supporté : copier le texte + URL dans le presse-papier avec un toast de confirmation

#### 2. Section "Zones de stockage" (EXISTANT — ne pas toucher la logique)
- Garde le titre de section avec icône MapPin
- Garde les zone rows avec boutons edit/delete
- Garde le bouton "Ajouter une zone" dashed

#### 3. À propos (RÉDUIT)
- Remplacer la section "À propos" actuelle par **une seule ligne centrée** :
  - `CaveScan v1.0.0 · Reconnaissance d'étiquettes`
  - Taille 11px, couleur `text-muted` (`#A09A93`)
  - Optionnel : 3 petits dots décoratifs au-dessus (3px, ronds, couleur `border-color`)

#### 4. Déconnexion (DÉPLACÉ EN BAS)
- Email de l'utilisateur au-dessus du bouton, centré, 11px, `text-muted`
- Bouton "Se déconnecter" : bordure `border-color`, texte `text-secondary`, icône LogOut
  - Style outline (pas filled), pleine largeur, `border-radius: 10px`
- La logique de déconnexion ne change pas, on déplace juste le bouton

### Ce qui ne change pas
- La logique CRUD des zones
- L'authentification / déconnexion
- Le header de page (branding CAVESCAN + titre "Réglages")
- La navigation bottom bar

---

## Tâche 2 — Signature "Partagé avec CaveScan"

### Fichier : `BottlePage.tsx` (ou là où se trouve `handleShare`)

Modifier la fonction de partage pour **ajouter une signature en fin de message** :

```typescript
// À la fin du texte de partage, avant l'appel navigator.share :
const signature = '\n—\nPartagé avec CaveScan';
const shareText = `${existingText}${signature}`;
```

Le message final dans WhatsApp/iMessage doit ressembler à :

```
🍷 Chartogne Taillet 2019
Champagne

Bulles très fines, nez de brioche et agrumes...

—
Partagé avec CaveScan
```

### Important
- **Pas d'URL** dans la signature — juste le texte "Partagé avec CaveScan"
- Le tiret cadratin `—` (em dash) sert de séparateur visuel
- Ne pas toucher au contenu existant du message (vin, note de dégustation, etc.)
- Ne pas toucher à la logique `navigator.share()` existante, juste modifier le texte passé

---

## Tests de validation

### Réglages
- [ ] L'invitation est la première section visible
- [ ] Le bouton "Envoyer une invitation" ouvre le share sheet natif (iOS/Android)
- [ ] Le texte partagé contient le lien `cavescan.vercel.app`
- [ ] Les zones de stockage fonctionnent comme avant (CRUD)
- [ ] Le bouton déconnexion est tout en bas de la page
- [ ] L'email du user s'affiche au-dessus du bouton déconnexion
- [ ] "À propos" est une ligne compacte, pas une section

### Partage de dégustation
- [ ] Le message partagé se termine par `—\nPartagé avec CaveScan`
- [ ] La note de dégustation existante n'est pas altérée
- [ ] Le partage fonctionne toujours via WhatsApp, iMessage, SMS

---

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `pages/Settings.tsx` | Refonte layout : ajout invite, réorg sections, compact about |
| `pages/BottlePage.tsx` | Ajout signature au texte de partage |

Aucun nouveau fichier, aucune dépendance, aucun changement Supabase.
