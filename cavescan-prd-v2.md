# CaveScan - PRD v2

## Vision

**Une cave Ã  vin qui se gÃ¨re toute seule** pour les amateurs qui achÃ¨tent rÃ©guliÃ¨rement mais n'ont pas la rigueur de tenir un inventaire.

### Le problÃ¨me

- J'achÃ¨te du vin mais je ne sais plus ce que j'ai
- Je ne sais pas oÃ¹ sont rangÃ©es mes bouteilles
- Je rate les fenÃªtres de maturitÃ©
- Je n'ai aucune idÃ©e de la valeur de ma cave
- **Les apps existantes demandent trop de saisie**

### La promesse

> "Photo â†’ c'est rangÃ©. Photo â†’ c'est sorti. Le reste est automatique."

---

## Utilisateur cible

Amateur de vin avec une cave de 50-500 bouteilles, qui :
- AchÃ¨te rÃ©guliÃ¨rement (cavistes, domaines, salons)
- Stocke Ã  plusieurs endroits (caves Ã©lectriques, cartons)
- Ne tiendra jamais un Excel Ã  jour
- Veut retrouver ses bouteilles et savoir quand les boire

**Contexte initial** : utilisateur unique, Android, rÃ©seau disponible en cave.

---

## DÃ©cisions prises

| Question | DÃ©cision | Raison |
|----------|----------|--------|
| Plateforme | PWA mobile-first | Android = bon support PWA, Ã©vite les galÃ¨res Expo Go |
| Offline | Non critique au MVP | RÃ©seau dispo en cave |
| Multi-utilisateur | Non au MVP | Usage solo pour commencer |
| GranularitÃ© localisation | Zone + Ã©tagÃ¨re | La profondeur est trop pÃ©nible Ã  maintenir manuellement |
| RFID / NFC | ReportÃ© post-MVP | NÃ©cessite app native (Bluetooth SPP incompatible PWA), friction hardware |
| Source de donnÃ©es vins | Hors MVP | Se concentrer sur la saisie photo d'abord |

---

## Stack technique

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”     â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚     Vercel       â”‚     â”‚          Supabase             â”‚
â”‚                  â”‚     â”‚                               â”‚
â”‚  - PWA React     â”‚â”€â”€â”€â”€â–¶â”‚  - PostgreSQL (donnÃ©es vins)  â”‚
â”‚  - Vite + TW     â”‚     â”‚  - Storage (photos Ã©tiquettes)â”‚
â”‚  - API routes    â”‚     â”‚  - Auth (si besoin futur)     â”‚
â”‚                  â”‚     â”‚  - Edge Functions              â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜     â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚
         â–¼
   Claude API (Sonnet)
   Vision : extraction Ã©tiquettes
```

| Composant | Choix | Raison |
|-----------|-------|--------|
| Frontend | React + Vite + Tailwind + shadcn/ui | Simple, rapide, PWA native |
| Backend / DB | Supabase (PostgreSQL + Storage + Edge Functions) | Tout-en-un, rÃ©duit le nombre de services |
| Vision AI | Claude Sonnet via API | Meilleur rapport qualitÃ©/coÃ»t pour OCR Ã©tiquettes |
| HÃ©bergement front | Vercel | DÃ©jÃ  utilisÃ© sur d'autres projets, deploy auto |
| Domaine | Porkbun | DÃ©jÃ  utilisÃ© |

---

## FonctionnalitÃ©s

### MVP (v0.1) â€” Objectif : utiliser l'app au quotidien pendant 2-3 mois

| Fonction | Description | Friction |
|----------|-------------|----------|
| **EntrÃ©e par photo** | Photo Ã©tiquette â†’ extraction auto (domaine, appellation, millÃ©sime, couleur) via Claude Vision | 1 photo + confirmation |
| **Localisation simple** | Choix de zone + Ã©tagÃ¨re au moment de l'entrÃ©e | 2 taps |
| **Inventaire consultable** | Liste filtrÃ©e par couleur, rÃ©gion, millÃ©sime | 0 |
| **Recherche** | "OÃ¹ est mon Brunello ?" â†’ rÃ©ponse directe | 0 |
| **Sortie par scan** | Photo Ã©tiquette â†’ match avec l'inventaire â†’ marquÃ©e "bue" | 1 photo |
| **Sorties rÃ©centes** | Liste des derniÃ¨res bouteilles bues, accÃ¨s rapide | 0 |
| **Note de dÃ©gustation** | Optionnel, asynchrone : depuis la fiche d'une sortie rÃ©cente | Quand j'ai envie |

#### Flux "EntrÃ©e par photo" (dÃ©tail)

1. User ouvre l'app â†’ bouton "Ajouter"
2. Prise de photo de l'Ã©tiquette
3. Upload vers Supabase Storage
4. Appel Claude Sonnet : extraction domaine, appellation, millÃ©sime, couleur
5. Affichage du rÃ©sultat pour validation / correction
6. SÃ©lection de la zone + Ã©tagÃ¨re (2 taps)
7. Enregistrement en base

**Cible : < 10 secondes du lancement au rangement.**

#### Flux "Sortie par scan" (dÃ©tail)

1. User ouvre l'app â†’ bouton "Sortie"
2. Prise de photo de l'Ã©tiquette
3. Claude Vision extrait les infos â†’ match avec les bouteilles en stock
4. Si match unique : confirmation en 1 tap â†’ marquÃ©e "bue"
5. Si plusieurs matchs (mÃªme vin, plusieurs millÃ©simes) : sÃ©lection dans une liste courte
6. La bouteille apparaÃ®t dans "Sorties rÃ©centes"

#### Flux "Note de dÃ©gustation" (dÃ©tail)

1. User ouvre l'app â†’ voit les sorties rÃ©centes (en haut de l'Ã©cran home ou onglet dÃ©diÃ©)
2. Tap sur une sortie rÃ©cente â†’ fiche bouteille avec photo de l'Ã©tiquette
3. Champ texte libre pour noter ses impressions
4. Pas de notation chiffrÃ©e imposÃ©e, juste du texte libre

**Principe : la note est toujours optionnelle. ZÃ©ro friction si on ne veut pas noter.**

### V1 â€” Enrichissement

| Fonction | Description |
|----------|-------------|
| **FenÃªtre de maturitÃ©** | Enrichissement via API (Wine-Searcher/Vivino) â†’ alertes "Ã  boire maintenant" |
| **Prix marchÃ©** | RÃ©cupÃ©ration du prix moyen â†’ valorisation totale de la cave |
| **Import factures** | Photo/PDF de facture caviste â†’ import batch |
| **QuantitÃ©s** | GÃ©rer x6, x12 d'un mÃªme vin |

### V2 â€” RÃ©duire la friction des sorties

| Fonction | Description |
|----------|-------------|
| **Sortie vocale** | "OK Google, j'ouvre le ChÃ¢teauneuf 2019" |
| **Photo bouteille vide** | Reconnaissance post-dÃ©gustation |
| **RFID / NFC** | Tags sur bouteilles + lecteur pour scan rapide (nÃ©cessitera migration app native) |
| **Mode "je devine"** | FIFO automatique si on dÃ©clare juste "j'ai bu un rouge" |

### Nice to have

- Historique de consommation et tendances
- Suggestions accords mets-vins
- Partage de cave avec des amis
- Export pour assurance

---

## ModÃ¨le de donnÃ©es MVP

```sql
-- Zones de stockage (personnalisables)
CREATE TABLE zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,           -- "Cave Ã©lectrique 1"
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
  couleur TEXT CHECK (couleur IN ('rouge', 'blanc', 'rosÃ©', 'bulles')),
  raw_extraction JSONB,        -- RÃ©ponse brute Claude pour debug/amÃ©lioration

  -- Localisation
  zone_id UUID REFERENCES zones(id),
  shelf TEXT,                   -- "Ã‰tagÃ¨re 1", "Haut", "Bas"...

  -- Photo
  photo_url TEXT,

  -- Ã‰tat
  status TEXT DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'drunk')),

  -- Timestamps
  added_at TIMESTAMPTZ DEFAULT now(),
  drunk_at TIMESTAMPTZ,

  -- DÃ©gustation (optionnel, rempli aprÃ¨s sortie)
  tasting_note TEXT,             -- Note libre de dÃ©gustation

  -- Futur enrichissement
  price NUMERIC,
  drink_from INT,              -- MillÃ©sime de dÃ©but de maturitÃ©
  drink_until INT,             -- MillÃ©sime de fin de maturitÃ©
  notes TEXT
);
```

### Zones par dÃ©faut (config initiale)

```
1. Cave Ã©lectrique 1 â€” Rouges
2. Cave Ã©lectrique 2 â€” Rouges
3. Cave Ã©lectrique 3 â€” Blancs et Champagne
4. Cave cartons â€” Stock long terme
```

---

## Prompt Claude Vision (draft)

```
Analyse cette photo d'Ã©tiquette de vin et extrais les informations suivantes
au format JSON :

{
  "domaine": "nom du domaine/chÃ¢teau/producteur",
  "appellation": "appellation d'origine (AOC/AOP/DOC/DOCG...)",
  "millesime": annÃ©e (nombre entier ou null si non visible),
  "couleur": "rouge" | "blanc" | "rosÃ©" | "bulles",
  "region": "rÃ©gion viticole",
  "cepage": "cÃ©page principal si mentionnÃ©",
  "confidence": 0.0-1.0
}

Si une information n'est pas visible sur l'Ã©tiquette, utilise null.
Pour la couleur, dÃ©duis-la de l'appellation si elle n'est pas explicite.
```

---

## MÃ©triques de succÃ¨s MVP

| MÃ©trique | Cible |
|----------|-------|
| Temps d'ajout d'une bouteille | < 10 secondes |
| Taux de reconnaissance Ã©tiquette | > 85% |
| Bouteilles ajoutÃ©es aprÃ¨s 1 mois d'usage | > 50 |
| Sorties dÃ©clarÃ©es vs estimÃ©es | > 60% |

---

## Ã‰crans MVP

1. **Home / Inventaire** : liste des bouteilles en stock, filtres (couleur, zone, millÃ©sime) + bandeau "Sorties rÃ©centes" en haut
2. **Ajouter (entrÃ©e)** : camÃ©ra â†’ rÃ©sultat extraction â†’ sÃ©lection zone/Ã©tagÃ¨re â†’ save
3. **Sortir (sortie)** : camÃ©ra â†’ match inventaire â†’ confirmation â†’ marquÃ©e "bue"
4. **DÃ©tail bouteille** : infos complÃ¨tes, photo Ã©tiquette, localisation. Si bue : champ note de dÃ©gustation
5. **Recherche** : champ texte libre, rÃ©sultats instantanÃ©s
6. **ParamÃ¨tres** : gestion des zones de stockage

---

## Roadmap

Voir backlog.md pour la liste des idees et travaux en cours.


| Phase | Scope | CritÃ¨re de passage |
|-------|-------|--------------------|
| **MVP** | Photo entrÃ©e/sortie + zones + inventaire + recherche + sorties rÃ©centes + notes dÃ©gustation | J'utilise l'app toutes les semaines pendant 2 mois |
| **V1** | Enrichissement prix/maturitÃ© + import factures | Base de 50+ bouteilles atteinte |
| **V2** | Sorties facilitÃ©es (vocale, RFID) | Sorties dÃ©clarÃ©es > 60% |

---

## Nom

**CaveScan** (confirmÃ© pour le dÃ©veloppement, nom final Ã  dÃ©finir)

