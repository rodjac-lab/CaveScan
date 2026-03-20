# Celestin — PRD v3

_Mis a jour le 2026-03-18_

## Vision

**Celestin — ton sommelier IA personnel.**

On vend un sommelier, on livre un ami.

La promesse : un sommelier qui connait ta cave, tes gouts et tes souvenirs — dans ta poche. L'experience : un ami expert avec qui tu parles vin, qui se souvient de tout, qui te guide dans tes choix, et qui sublime tes meilleurs moments.

Celestin rend ton experience du vin plus simple, plus plaisante et plus satisfaisante.

### Ce qui compte

La **qualite conversationnelle** est LA metrique produit. Pas le nombre de bouteilles encavees, pas le nombre de features — la qualite de la relation entre l'utilisateur et Celestin. Si l'utilisateur a envie de parler vin avec Celestin un mardi soir a 23h, le produit fonctionne.

### Le modele

```
CE QUE LES GENS CHERCHENT     CE QUI DIFFERENCIE          CE QUI RETIENT
(acquisition / WTP)            (activation)                (retention / moat)

"Gerer ma cave"           ->   "J'ai un ami qui             -> "Celestin me connait,
                                connait le vin !"               je ne peux plus m'en passer"

CAVE MANAGEMENT                CONVERSATION                MEMOIRE + SOUVENIRS
= le painkiller                = le plaisir quotidien       = le switching cost
= ce qu'ils cherchent          = ce qui les fait rester     = ce qu'ils ne retrouveront
= ce qui justifie le prix      = ce qui differencie            nulle part ailleurs
```

### Promesse

> "Ton sommelier IA personnel — il connait ta cave, tes gouts et tes souvenirs."

### Problemes resolus

1. **J'ai envie de parler vin mais personne autour de moi ne s'y connait** — Celestin est toujours dispo, cultive, opiniatre
2. **Je ne sais plus ce que j'ai en cave** — inventaire par photo, sans saisie
3. **J'oublie les vins que j'ai aimes et les moments associes** — souvenirs sublimes, resurfaces au bon moment
4. **Je ne sais pas quoi ouvrir ce soir** — Celestin recommande selon le plat, la saison, l'envie
5. **Je ne sais pas quoi choisir au restaurant** — photo de la carte, Celestin conseille
6. **Je ne sais pas quoi acheter** — Celestin connait mes gouts et ce qui manque dans ma cave
7. **Je veux partager mes decouvertes** — belles cartes de degustation partageables

---

## Utilisateur cible

Amateur de vin avec 50 a 500 bouteilles qui achete regulierement et ne maintiendra jamais un tableur.

Personas detailles dans `docs/personas.md` :
- **Philippe** (principal) — 180 btl, veut la simplicite absolue
- **Caroline** (secondaire) — 350 btl, veut les souvenirs et le partage
- **Maxime** (tertiaire) — 60 btl, veut l'app moderne et intelligente

Anti-personas : le collectionneur-investisseur (2500+ btl, besoin patrimonial) et le buveur Vivino (pas de cave).

---

## Ce que fait Celestin

### 1. Un ami avec qui parler vin

Le coeur du produit. Celestin est un interlocuteur avec qui on a **plaisir** a discuter vin. Il a des opinions tranchees (Loire, Jura, anti-cliches), de l'humour, et une vraie culture. Il ne se contente pas de repondre — il surprend, challenge, et donne envie de revenir.

Il connait :
- Ta cave (stock reel, appellations, millesimes)
- Tes gouts (notes de degustation, tags, profil sensoriel)
- Tes souvenirs (moments marques, vins preferes, accords reussis)

Il sait recommander, expliquer, debattre, proposer des accords, raconter l'histoire d'un domaine, et engager la conversation de facon naturelle.

**Architecture** : orchestrateur avec Turn Interpreter, State Machine (6 etats), 4 Cognitive Modes (wine_conversation, cellar_assistant, restaurant_assistant, tasting_memory), Response Policy post-LLM. Detail dans `docs/celestin-architecture.md`.

### 2. Des souvenirs sublimes

Le vin, c'est des moments. Celestin transforme des notes de degustation brutes en **souvenirs vivants** :

- Tags extraits automatiquement (plats, descripteurs, occasion, sentiment, maturite)
- Semantic search — "le vin italien de Noel" retrouve le bon souvenir
- Souvenirs resurfaces au bon moment dans la conversation ("La derniere fois que tu as mange du canard, c'etait avec le Madiran de Montus — tu avais adore")
- Belles cartes de degustation partageables (photo + infos + branding)
- Wine Wrapped annuel : tes appellations preferees, ta meilleure decouverte, tes accords marquants (a faire)

### 3. Une cave qui se gere toute seule

Encaver = photo de l'etiquette + 2 taps. Sortir = photo + confirmation.

- Inventaire consultable avec recherche et filtres
- Localisation par zone + etagere
- Gestion des quantites (x6, x12)
- Enrichissement automatique (aromes, accords, temperature, cepage, caractere)

### 4. Un guide au restaurant et chez le caviste

- Photo de la carte des vins → Celestin recommande en fonction du plat et du profil
- Mode "hors cave" : recommandation parmi des vins que l'utilisateur n'a pas
- Personal wine shopper : Celestin peut chercher des bouteilles a acheter en ligne, filtrees par tes gouts et ta cave (a faire — via tool use + API de recherche)

### 5. Un compagnon proactif (a faire)

Celestin ne devrait pas attendre qu'on lui parle. Un vrai ami t'envoie un message au bon moment :
- Vendredi 17h : "Ton Saint-Joseph 2021 est pile en zone. Grillades ce soir ?"
- Apres une degustation notee : "Tu as mis 5/5. Tu en as encore 2. A racheter ?"
- Anniversaire d'un souvenir : "Il y a 1 an, tu as bu ce Barolo incroyable chez Marc"
- Resume hebdo : "2 bouteilles ouvertes, 1 nouvelle appellation. Cave : 47 bouteilles."

---

## Flows principaux

### Encaver (< 10 secondes)
Photo etiquette → extraction IA → correction rapide → zone + etagere → sauvegarde

### Deguster (Cheers!)
Photo etiquette → match en cave (ou hors cave) → notes de degustation → partage

### Deguster (batch)
Selection multiple (jusqu'a 12 photos) → extraction parallele → revue par item → sauvegarde groupee

### Parler a Celestin
Message libre → Turn Interpreter → cognitive mode → LLM avec contexte (cave, souvenirs, profil) → reponse + actions (cartes vin, ajout cave, notes)

### Sommelier au resto
Photo carte des vins → OCR → "je prends le magret" → Celestin recommande depuis la carte

---

## Decisions produit

| Question | Decision | Raison |
|----------|----------|--------|
| Plateforme | PWA mobile-first | Deploiement simple, pas d'app store |
| LLM principal | Claude Haiku 4.5 | Meilleur suivi d'instructions, bon francais |
| LLM fallback | Gemini 2.5 Flash, puis Mistral Small | Cout reduit (free tier) / dernier recours |
| Memoire semantique | OpenAI text-embedding-3-small + pgvector | Recherche par sens, pas juste par mots-cles |
| Offline | Non critique | Reseau dispo en cave dans le contexte cible |
| Multi-utilisateur | Post-lancement | Priorite a la valeur solo |

---

## Stack technique

- **Frontend** : React + Vite + TypeScript + Tailwind + shadcn/ui
- **Backend** : Supabase (PostgreSQL + pgvector, Storage, Auth, Edge Functions)
- **LLM** : Claude Haiku 4.5 (primaire), Gemini 2.5 Flash (fallback), Mistral Small (fallback 2)
- **Embeddings** : OpenAI text-embedding-3-small (1536 dims)
- **OCR** : Gemini 2.5 Flash (extraction etiquette)
- **Hosting** : Vercel (frontend), Supabase (backend + edge functions)
- **URL** : https://mycelestin.com/

### Edge Functions
- `celestin/` — sommelier unifie (deploy avec `--no-verify-jwt`)
- `extract-wine/` — OCR etiquette
- `extract-tasting-tags/` — extraction tags degustation
- `enrich-wine/` — enrichissement texte
- `generate-embedding/` — embeddings OpenAI

---

## Navigation

5 onglets : **Cave** · **Degustations** · **[Scanner]** · **Celestin** · **Reglages**

| Route | Ecran |
|-------|-------|
| `/cave` | Inventaire, recherche, filtres |
| `/cheers` | Degustations recentes |
| `/scanner` | Plein ecran, choix intent (Encaver / Deguster) |
| `/decouvrir` | Celestin (chat + cartes) |
| `/settings` | Zones, profil, debug |
| `/bottle/:id` | Fiche bouteille |
| `/bottle/:id/edit` | Edition bouteille |

---

## Modele de donnees

```sql
-- Table principale
bottles (
  id, user_id,
  -- Identite vin
  domaine, cuvee, appellation, millesime, couleur,
  -- Localisation
  zone_id → zones(id), shelf,
  -- Stock
  status (in_stock | drunk), quantity,
  -- Photos
  photo_url, photo_url_back,
  -- Degustation
  tasting_note, tasting_photos JSONB, rating (1-5), qpr (1-3), rebuy,
  -- Enrichissement
  grape_varieties, serving_temperature, typical_aromas, food_pairings, character,
  -- Prix & maturite
  purchase_price, market_value, drink_from, drink_until,
  -- Tags & embeddings
  tasting_tags JSONB, embedding vector(1536),
  -- Dates
  added_at, drunk_at, updated_at
)

zones (id, name, description, rows, columns, position)
events (id, user_id, action, metadata JSONB, created_at)
```

---

## Metriques

| Metrique | Cible | Pourquoi |
|----------|-------|----------|
| **Conversations / user / semaine** | **> 3** | **Metrique #1 — si les gens parlent a Celestin, le produit fonctionne** |
| Retention J7 | > 40% | L'utilisateur revient apres la premiere semaine |
| Retention J30 | > 20% | L'habitude est installee |
| Souvenirs crees / user / mois | > 2 | Les gens notent leurs degustations |
| Temps d'ajout d'une bouteille | < 10s | La cave ne doit pas etre un frein |
| Taux de reconnaissance etiquette | > 85% | L'OCR doit etre fiable |
| Cout LLM / user / mois | < 1 EUR | Soutenabilite economique |

---

## Business model

| Couche | Revenu | Source |
|--------|--------|--------|
| **Free** | 0 EUR | Cave management, 5 conversations Celestin/mois, notes basiques |
| **Premium** (9.99 EUR/mois) | Abonnement | Conversations illimitees, wine search, belles cartes memoire, Wine Wrapped, notifications proactives |
| **Affiliation** (futur) | Commission 5-8% | Bouteilles achetees via liens Celestin |

L'affiliation est le vrai upside a terme — ca scale avec l'usage et c'est invisible pour l'utilisateur. Mais la priorite court terme est de valider que les gens veulent parler a Celestin (conversations/semaine).

---

## Etat actuel (mars 2026)

### Fait
- Conversation Celestin (recommandations, accords, encavage, culture vin, restaurant)
- Orchestrateur complet (state machine, turn interpreter, 4 cognitive modes, prompt builder, response policy)
- Persona opiniatree et testee (Loire/Jura, anti-cliches, humour)
- Memoire V1 (tasting tags, souvenirs proactifs, cross-session localStorage)
- Memoire V2 (semantic search via pgvector + embeddings)
- Cave complete (ajout/sortie/edition/recherche/filtres/zones)
- OCR etiquette + enrichissement automatique
- Notes de degustation + partage
- Batch deguster (jusqu'a 12 photos)
- Questionnaire profil vin
- Performance (lazy loading, vendor splitting, error boundary)

### Pas encore fait
- Souvenirs sublimes (belles cartes, Wine Wrapped, resurfacing anniversaires)
- Personal wine shopper (tool use + API recherche)
- Proactivite (notifications push, micro-rituels)
- Auth edge functions, RGPD, suivi couts
- Monetisation (freemium + Stripe)

Voir `docs/backlog.md` pour le detail.
