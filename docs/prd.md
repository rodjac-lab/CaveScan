# CaveScan - PRD v2

## Vision

**Une cave à vin qui se gère presque toute seule** pour les amateurs qui achètent régulièrement mais ne veulent pas maintenir un inventaire à la main.

### Problème cible

- J'achète du vin mais je ne sais plus ce que j'ai
- Je ne sais plus où sont rangées mes bouteilles
- Je rate des fenêtres de maturité
- Je n'ai pas de vue simple de la valeur de ma cave
- Les apps existantes demandent trop de saisie manuelle

### Promesse

> "Photo -> c'est rangé. Photo -> c'est sorti. Le reste est automatique."

## Utilisateur cible

Amateur de vin avec 50 à 500 bouteilles qui:

- Achète régulièrement (cavistes, domaines, salons)
- Stocke à plusieurs endroits (caves électriques, cartons)
- Ne maintiendra jamais un tableur rigoureux
- Veut retrouver vite une bouteille et savoir quand la boire

Contexte initial: utilisateur solo, usage mobile Android, réseau disponible en cave.

## Décisions produit

| Question | Décision | Raison |
|----------|----------|--------|
| Plateforme | PWA mobile-first | Déploiement simple, pas d'app store |
| Offline | Non critique au MVP | Réseau dispo en cave dans le contexte cible |
| Multi-utilisateur | Non au MVP | Priorité à la valeur solo immédiatement |
| Localisation | Zone + étagère | Granularité utile sans surcharge de saisie |
| RFID/NFC | Post-MVP | Friction hardware et contraintes natives |
| Enrichissement données vin | Hors MVP | Priorité à l'entrée/sortie rapide |

## Stack technique

- Frontend: React + Vite + TypeScript + Tailwind + shadcn/ui
- Backend/Data: Supabase (PostgreSQL, Storage, Auth, Edge Functions)
- Vision IA: Claude (principal) avec fallback Gemini via Edge Function
- Hébergement front: Vercel

## Fonctionnalités

### MVP (v0.1)

| Fonction | Description | Friction |
|----------|-------------|----------|
| Entrée par photo | Photo étiquette -> extraction auto (domaine, cuvée, appellation, millésime, couleur) | 1 photo + validation |
| Localisation simple | Choix de zone + étagère | 2 taps |
| Inventaire consultable | Liste des bouteilles en stock avec filtres | 0 |
| Recherche | Recherche domaine/appellation/millésime | 0 |
| Sortie par scan | Photo étiquette -> match inventaire -> statut `drunk` | 1 photo |
| Sorties récentes | Liste des dernières bouteilles sorties | 0 |
| Note de dégustation | Optionnelle depuis la fiche bouteille | Optionnel |

### Flux Entrée

1. Ouvrir l'app et aller sur Ajouter
2. Prendre une photo ou choisir une photo
3. Extraction IA des champs
4. Corriger/valider rapidement
5. Choisir zone + étagère
6. Sauvegarder en base

Cible: < 10 secondes du lancement au rangement.

### Flux Sortie

1. Ouvrir l'app et aller sur Sortir
2. Prendre une photo de l'étiquette
3. Extraction IA puis matching sur les bouteilles `in_stock`
4. Si match unique: confirmation rapide
5. Si plusieurs matchs: sélection dans la liste
6. La bouteille passe en `drunk` et apparaît en sorties récentes

### Flux Note de dégustation

1. Ouvrir une bouteille déjà sortie
2. Saisir une note libre (facultatif)
3. Sauvegarder

Principe: aucune friction supplémentaire si l'utilisateur ne veut pas noter.

## Évolutions

### V1

- Fenêtres de maturité (enrichissement externe)
- Valeur de cave (prix marché)
- Import facture (photo/PDF)
- Gestion fine des quantités (x6/x12)

### V2

- Sortie vocale
- Reconnaissance bouteille vide
- RFID/NFC (si migration vers app native)
- Mode déclaration rapide

## Modèle de données MVP (logique)

```sql
CREATE TABLE zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE bottles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domaine TEXT,
  cuvee TEXT,
  appellation TEXT,
  millesime INT,
  couleur TEXT CHECK (couleur IN ('rouge', 'blanc', 'rose', 'bulles')),
  raw_extraction JSONB,
  zone_id UUID REFERENCES zones(id),
  shelf TEXT,
  photo_url TEXT,
  status TEXT DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'drunk')),
  added_at TIMESTAMPTZ DEFAULT now(),
  drunk_at TIMESTAMPTZ,
  tasting_note TEXT,
  price NUMERIC,
  drink_from INT,
  drink_until INT,
  notes TEXT
);
```

## Prompt extraction (référence)

La fonction doit retourner un JSON strict:

```json
{
  "domaine": "nom du domaine/château/producteur",
  "cuvée": "nom de la cuvée si mentionnée",
  "appellation": "appellation d'origine",
  "millésime": 2020,
  "couleur": "rouge | blanc | rose | bulles",
  "région": "région viticole",
  "cépage": "cépage principal",
  "confidence": 0.0
}
```

Règles:

- `null` si information non visible
- Réponse strictement JSON
- Couleur déduite de l'appellation si nécessaire

## Métriques MVP

| Métrique | Cible |
|----------|-------|
| Temps d'ajout d'une bouteille | < 10 s |
| Taux de reconnaissance étiquette | > 85% |
| Bouteilles ajoutées après 1 mois | > 50 |
| Sorties déclarées vs estimées | > 60% |

## Écrans MVP

1. Home/Inventaire
2. Ajouter (entrée)
3. Sortir (sortie)
4. Détail bouteille
5. Recherche
6. Paramètres (zones)

## Roadmap

- MVP: entrée/sortie photo + inventaire + recherche + sorties récentes + notes
- V1: enrichissement prix/maturité + import factures
- V2: sortie encore plus fluide (voix, RFID)

## Nom

CaveScan (nom de travail validé pour le développement).
