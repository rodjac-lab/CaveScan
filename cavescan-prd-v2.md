# CaveScan - PRD v2

## Vision

**Une cave à vin qui se gère toute seule** pour les amateurs qui achètent régulièrement mais n'ont pas la rigueur de tenir un inventaire.

### Le problème

- J'achète du vin mais je ne sais plus ce que j'ai
- Je ne sais pas où sont rangées mes bouteilles
- Je rate les fenêtres de maturité
- Je n'ai aucune idée de la valeur de ma cave
- **Les apps existantes demandent trop de saisie**

### La promesse

> "Photo → c'est rangé. Photo → c'est sorti. Le reste est automatique."

---

## Utilisateur cible

Amateur de vin avec une cave de 50-500 bouteilles, qui :
- Achète régulièrement (cavistes, domaines, salons)
- Stocke à plusieurs endroits (caves électriques, cartons)
- Ne tiendra jamais un Excel à jour
- Veut retrouver ses bouteilles et savoir quand les boire

**Contexte initial** : utilisateur unique, Android, réseau disponible en cave.

---

## Décisions prises

| Question | Décision | Raison |
|----------|----------|--------|
| Plateforme | PWA mobile-first | Android = bon support PWA, évite les galères Expo Go |
| Offline | Non critique au MVP | Réseau dispo en cave |
| Multi-utilisateur | Non au MVP | Usage solo pour commencer |
| Granularité localisation | Zone + étagère | La profondeur est trop pénible à maintenir manuellement |
| RFID / NFC | Reporté post-MVP | Nécessite app native (Bluetooth SPP incompatible PWA), friction hardware |
| Source de données vins | Hors MVP | Se concentrer sur la saisie photo d'abord |

---

## Stack technique

```
┌─────────────────┐     ┌──────────────────────────────┐
│     Vercel       │     │          Supabase             │
│                  │     │                               │
│  - PWA React     │────▶│  - PostgreSQL (données vins)  │
│  - Vite + TW     │     │  - Storage (photos étiquettes)│
│  - API routes    │     │  - Auth (si besoin futur)     │
│                  │     │  - Edge Functions              │
└─────────────────┘     └──────────────────────────────┘
         │
         ▼
   Claude API (Sonnet)
   Vision : extraction étiquettes
```

| Composant | Choix | Raison |
|-----------|-------|--------|
| Frontend | React + Vite + Tailwind + shadcn/ui | Simple, rapide, PWA native |
| Backend / DB | Supabase (PostgreSQL + Storage + Edge Functions) | Tout-en-un, réduit le nombre de services |
| Vision AI | Claude Sonnet via API | Meilleur rapport qualité/coût pour OCR étiquettes |
| Hébergement front | Vercel | Déjà utilisé sur d'autres projets, deploy auto |
| Domaine | Porkbun | Déjà utilisé |

---

## Fonctionnalités

### MVP (v0.1) — Objectif : utiliser l'app au quotidien pendant 2-3 mois

| Fonction | Description | Friction |
|----------|-------------|----------|
| **Entrée par photo** | Photo étiquette → extraction auto (domaine, appellation, millésime, couleur) via Claude Vision | 1 photo + confirmation |
| **Localisation simple** | Choix de zone + étagère au moment de l'entrée | 2 taps |
| **Inventaire consultable** | Liste filtrée par couleur, région, millésime | 0 |
| **Recherche** | "Où est mon Brunello ?" → réponse directe | 0 |
| **Sortie par scan** | Photo étiquette → match avec l'inventaire → marquée "bue" | 1 photo |
| **Sorties récentes** | Liste des dernières bouteilles bues, accès rapide | 0 |
| **Note de dégustation** | Optionnel, asynchrone : depuis la fiche d'une sortie récente | Quand j'ai envie |

#### Flux "Entrée par photo" (détail)

1. User ouvre l'app → bouton "Ajouter"
2. Prise de photo de l'étiquette
3. Upload vers Supabase Storage
4. Appel Claude Sonnet : extraction domaine, appellation, millésime, couleur
5. Affichage du résultat pour validation / correction
6. Sélection de la zone + étagère (2 taps)
7. Enregistrement en base

**Cible : < 10 secondes du lancement au rangement.**

#### Flux "Sortie par scan" (détail)

1. User ouvre l'app → bouton "Sortie"
2. Prise de photo de l'étiquette
3. Claude Vision extrait les infos → match avec les bouteilles en stock
4. Si match unique : confirmation en 1 tap → marquée "bue"
5. Si plusieurs matchs (même vin, plusieurs millésimes) : sélection dans une liste courte
6. La bouteille apparaît dans "Sorties récentes"

#### Flux "Note de dégustation" (détail)

1. User ouvre l'app → voit les sorties récentes (en haut de l'écran home ou onglet dédié)
2. Tap sur une sortie récente → fiche bouteille avec photo de l'étiquette
3. Champ texte libre pour noter ses impressions
4. Pas de notation chiffrée imposée, juste du texte libre

**Principe : la note est toujours optionnelle. Zéro friction si on ne veut pas noter.**

### V1 — Enrichissement

| Fonction | Description |
|----------|-------------|
| **Fenêtre de maturité** | Enrichissement via API (Wine-Searcher/Vivino) → alertes "à boire maintenant" |
| **Prix marché** | Récupération du prix moyen → valorisation totale de la cave |
| **Import factures** | Photo/PDF de facture caviste → import batch |
| **Quantités** | Gérer x6, x12 d'un même vin |

### V2 — Réduire la friction des sorties

| Fonction | Description |
|----------|-------------|
| **Sortie vocale** | "OK Google, j'ouvre le Châteauneuf 2019" |
| **Photo bouteille vide** | Reconnaissance post-dégustation |
| **RFID / NFC** | Tags sur bouteilles + lecteur pour scan rapide (nécessitera migration app native) |
| **Mode "je devine"** | FIFO automatique si on déclare juste "j'ai bu un rouge" |

### Nice to have

- Historique de consommation et tendances
- Suggestions accords mets-vins
- Partage de cave avec des amis
- Export pour assurance

---

## Modèle de données MVP

```sql
-- Zones de stockage (personnalisables)
CREATE TABLE zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,           -- "Cave électrique 1"
  description TEXT,             -- "Service - blancs/champagnes"
  position INT DEFAULT 0,      -- Ordre d'affichage
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bouteilles
CREATE TABLE bottles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Extrait par Claude Vision
  domaine TEXT,
  appellation TEXT,
  millesime INT,
  couleur TEXT CHECK (couleur IN ('rouge', 'blanc', 'rosé', 'bulles')),
  raw_extraction JSONB,        -- Réponse brute Claude pour debug/amélioration

  -- Localisation
  zone_id UUID REFERENCES zones(id),
  shelf TEXT,                   -- "Étagère 1", "Haut", "Bas"...

  -- Photo
  photo_url TEXT,

  -- État
  status TEXT DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'drunk')),

  -- Timestamps
  added_at TIMESTAMPTZ DEFAULT now(),
  drunk_at TIMESTAMPTZ,

  -- Dégustation (optionnel, rempli après sortie)
  tasting_note TEXT,             -- Note libre de dégustation

  -- Futur enrichissement
  price NUMERIC,
  drink_from INT,              -- Millésime de début de maturité
  drink_until INT,             -- Millésime de fin de maturité
  notes TEXT
);
```

### Zones par défaut (config initiale)

```
1. Cave électrique 1 — Rouges
2. Cave électrique 2 — Rouges
3. Cave électrique 3 — Blancs et Champagne
4. Cave cartons — Stock long terme
```

---

## Prompt Claude Vision (draft)

```
Analyse cette photo d'étiquette de vin et extrais les informations suivantes
au format JSON :

{
  "domaine": "nom du domaine/château/producteur",
  "appellation": "appellation d'origine (AOC/AOP/DOC/DOCG...)",
  "millesime": année (nombre entier ou null si non visible),
  "couleur": "rouge" | "blanc" | "rosé" | "bulles",
  "region": "région viticole",
  "cepage": "cépage principal si mentionné",
  "confidence": 0.0-1.0
}

Si une information n'est pas visible sur l'étiquette, utilise null.
Pour la couleur, déduis-la de l'appellation si elle n'est pas explicite.
```

---

## Métriques de succès MVP

| Métrique | Cible |
|----------|-------|
| Temps d'ajout d'une bouteille | < 10 secondes |
| Taux de reconnaissance étiquette | > 85% |
| Bouteilles ajoutées après 1 mois d'usage | > 50 |
| Sorties déclarées vs estimées | > 60% |

---

## Écrans MVP

1. **Home / Inventaire** : liste des bouteilles en stock, filtres (couleur, zone, millésime) + bandeau "Sorties récentes" en haut
2. **Ajouter (entrée)** : caméra → résultat extraction → sélection zone/étagère → save
3. **Sortir (sortie)** : caméra → match inventaire → confirmation → marquée "bue"
4. **Détail bouteille** : infos complètes, photo étiquette, localisation. Si bue : champ note de dégustation
5. **Recherche** : champ texte libre, résultats instantanés
6. **Paramètres** : gestion des zones de stockage

---

## Roadmap

| Phase | Scope | Critère de passage |
|-------|-------|--------------------|
| **MVP** | Photo entrée/sortie + zones + inventaire + recherche + sorties récentes + notes dégustation | J'utilise l'app toutes les semaines pendant 2 mois |
| **V1** | Enrichissement prix/maturité + import factures | Base de 50+ bouteilles atteinte |
| **V2** | Sorties facilitées (vocale, RFID) | Sorties déclarées > 60% |

---

## Nom

**CaveScan** (confirmé pour le développement, nom final à définir)
