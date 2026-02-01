# CaveScan — Étude concurrentielle

_Février 2026_

---

## Résumé exécutif

Le marché des apps de gestion de cave à vin est mature mais fragmenté. Les leaders (CellarTracker, Vivino) ont bâti leur avantage sur la taille de leur base de données et leur communauté. Les challengers récents (Oeni, CellarMate.ai) misent sur l'IA et l'UX moderne. Aucun acteur ne résout élégamment le problème fondamental de CaveScan : **la friction à l'entrée et à la sortie des bouteilles**.

L'opportunité pour CaveScan n'est pas de concurrencer ces plateformes sur la richesse des données, mais de proposer une expérience radicalement plus simple pour un usage quotidien personnel.

---

## Paysage concurrentiel

### Tier 1 — Les mastodontes

#### CellarTracker
- **Fondé** : 2003 | **Users** : 8.8M | **Notes** : 13M+ | **Vins en base** : 5M+
- **Modèle** : Freemium (donation suggérée 40-160$/an selon taille de cave)
- **Note** : 4.9/5 App Store
- **Forces** : Base de données inégalée, notes communautaires, fenêtres de maturité, intégration Wine-Searcher pour les prix, export CSV/XML. IA récente basée sur 20 ans de données de dégustation.
- **Faiblesses** : Interface historiquement datée (refonte récente mais controversée), ajout de bouteille par UPC/barcode principalement, pas de scan d'étiquette natif (utilise Vivino en sous-traitance), courbe d'apprentissage. Certains users se plaignent de workflows cassés après la refonte 2025.
- **Cible** : Collectionneurs sérieux (100-10 000+ bouteilles)

#### Vivino
- **Fondé** : 2010 | **Users** : 70M | **Vins en base** : 16M+
- **Modèle** : Freemium + marketplace (commission sur ventes)
- **Note** : 4.5/5 Play Store
- **Forces** : Meilleur scan d'étiquette du marché (2M de scans/jour), réseau social vin, recommandations IA basées sur le profil de goût, marketplace intégrée.
- **Faiblesses** : La gestion de cave ("My Cellar") est une feature secondaire, pas le cœur du produit. Pas de localisation physique des bouteilles. Notes agrégées par vin (pas par millésime). Support client critiqué. Premium cher pour les features avancées.
- **Cible** : Grand public, acheteurs occasionnels

### Tier 2 — Les spécialistes cave

#### InVintory
- **Fondé** : ~2020 | **Note** : 4.8/5 App Store (1 500+ avis)
- **Modèle** : Free / Premium / Elite
- **Forces** : 3D cellar mapping (VinLocate), IA sommelier, base curatée par sommeliers professionnels, valorisation en temps réel, intégration capteurs Govee (température/humidité). UX moderne et soignée.
- **Faiblesses** : iOS uniquement (Android annoncé "coming soon" depuis longtemps), pas de scan d'étiquette aussi bon que Vivino, features premium payantes. Orienté grosses collections.
- **Cible** : Collectionneurs premium, caves de prestige

#### VinoCell
- **Fondé** : ~2012 | **Note** : 4.6/5 App Store
- **Modèle** : Payant (pas de version gratuite)
- **Plateforme** : iOS uniquement
- **Forces** : 40+ champs par bouteille, représentation graphique des casiers (44 formes), gestion profondeur 2 niveaux, import/export CSV/XLS, notations multi-échelles (5 étoiles, 100 points, 20 points), accords mets-vins, 50 guides de notation pro intégrés.
- **Faiblesses** : Pas de version Android, interface chargée (peut intimider), pas de scan IA d'étiquette, saisie principalement manuelle. Pas de communauté.
- **Cible** : Power users iOS, collectionneurs méthodiques

#### Oeni
- **Fondé** : ~2022 | **Note** : variable
- **Modèle** : Freemium
- **Forces** : App française, cave 3D, 400 000+ bouteilles en base, scan rapide, fenêtres de maturité, suivi des plus-values, sommelier IA, 5 400 accords mets-vins, analyse de dépenses.
- **Faiblesses** : Ne montre pas les cépages dans les fiches (critique récurrente), manque de profondeur sur certaines données. Positionnement un peu "couteau suisse" sans excellence claire.
- **Cible** : Amateurs français, entrée/milieu de gamme

### Tier 3 — Les nouveaux entrants IA

#### CellarMate.ai
- **Fondé** : 2025 | **Note** : Récent, peu d'avis
- **Modèle** : Freemium
- **Forces** : Interface conversationnelle (chat IA sommelier), scan étiquette IA, scan de rayons en magasin (bulk recognition), scan de tickets de caisse pour import des prix, recommandations restaurant depuis une photo de la carte des vins.
- **Faiblesses** : Très récent, base de données limitée, pas encore prouvé à l'échelle. iOS uniquement.
- **Cible** : Early adopters tech-savvy

#### VinoMatch (AI Wine Finder)
- **Fondé** : 2025 | iOS uniquement
- **Forces** : Photo de carte des vins au restaurant → 3 recommandations personnalisées. Apprend le profil de goût au fil du temps (acidité, corps, tanins).
- **Faiblesses** : Focus restaurant, pas vraiment une app de gestion de cave. Très niche.

#### OENO by Vintec
- **Fondé** : ~2020
- **Forces** : Scan propulsé par Vivino, conseils de service (température, décantage, verrerie), import auto des caves Vintec. Gratuit.
- **Faiblesses** : Lié à l'écosystème Vintec, interface basique, pas d'innovation récente notable.
- **Cible** : Possesseurs de caves Vintec

---

## Matrice comparative

| Critère | CellarTracker | Vivino | InVintory | VinoCell | Oeni | CellarMate.ai | **CaveScan** |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Scan étiquette IA** | Via Vivino | ★★★★★ | ★★★ | ✗ | ★★★ | ★★★★ | ★★★★ |
| **Rapidité d'ajout** | ★★ | ★★★★ | ★★★ | ★ | ★★★ | ★★★★ | ★★★★★ |
| **Rapidité de sortie** | ★★ | ★ | ★★ | ★★ | ★★ | ★★ | ★★★★★ |
| **Localisation physique** | Basique | ✗ | ★★★★★ (3D) | ★★★★ | ★★★ (3D) | ✗ | ★★★ |
| **Notes dégustation** | ★★★★★ | ★★★ | ★★★ | ★★★★★ | ★★★ | ★★★★ | ★★★ |
| **Communauté** | ★★★★★ | ★★★★★ | ★ | ✗ | ★ | ✗ | ✗ |
| **Base de données** | 5M vins | 16M vins | 2M vins | Manuelle | 400K | Limitée | ✗ (extraction IA) |
| **Valorisation cave** | ★★★★ | ★★★ | ★★★★ | ★★★ | ★★★★ | ✗ | ✗ (MVP) |
| **Android** | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✓ (PWA) |
| **Friction globale** | Élevée | Moyenne | Moyenne | Très élevée | Moyenne | Faible | **Très faible** |

---

## Analyse des points de douleur non résolus

### 1. La sortie de bouteille reste pénible partout
Aucune app ne propose un flux de sortie aussi rapide que le flux d'entrée. Partout c'est : ouvrir l'app → chercher dans l'inventaire → trouver la bouteille → marquer comme bue. CaveScan est la seule à proposer **photo de l'étiquette → match automatique → 1 tap**.

### 2. Le "je n'ai pas envie de sortir mon téléphone"
Les apps existantes ne résolvent pas la friction fondamentale : **l'effort cognitif de déclarer chaque sortie**. Le commentaire le plus récurrent dans les avis : "I love CellarTracker but I tend to have trouble remembering to note that I drank the bottle." C'est un problème de design, pas de feature.

### 3. L'overengineering de la saisie
VinoCell propose 40+ champs. InVintory modélise les caves en 3D. CellarTracker expose des métriques de valorisation. Pour l'amateur avec 50-300 bouteilles, c'est du bruit. Le marché manque d'une app qui fait **moins mais mieux**.

### 4. L'écosystème fermé iOS
InVintory, VinoCell, CellarMate.ai sont iOS only. CaveScan en PWA tourne partout nativement.

---

## Positionnement CaveScan

### Ce que CaveScan n'est PAS
- Pas un réseau social du vin (Vivino)
- Pas une encyclopédie communautaire (CellarTracker)
- Pas un outil de valorisation patrimoniale (InVintory)
- Pas un tableur à vin (VinoCell)

### Ce que CaveScan EST
**Le carnet de cave le plus rapide au monde.**

La promesse tient en une phrase : "Photo → c'est rangé. Photo → c'est sorti."

### Avantage concurrentiel unique

| Axe | CaveScan | Le marché |
|-----|----------|-----------|
| Temps d'ajout | < 10 sec (photo + 2 taps) | 30 sec à 2 min |
| Temps de sortie | < 5 sec (photo + 1 tap) | 30 sec à 1 min (recherche manuelle) |
| Courbe d'apprentissage | Nulle | 5-30 min selon l'app |
| Setup initial | 0 (pas de cave 3D à modéliser) | 10 min à 1 heure |
| Note de dégustation | Optionnelle, asynchrone | Souvent intégrée au flux de sortie (friction) |

---

## Opportunités "effet wahou"

Fonctionnalités à fort impact différenciant, classées par faisabilité.

### Court terme (intégrables au MVP ou V1)

1. **"Smart Pour" — Suggestion du soir**
   Notification push quotidienne (18h) : "Ce soir, pourquoi pas ce Crozes-Hermitage 2019 ? Il entre dans sa fenêtre de maturité." Basé sur les fenêtres de boisson + ce qui est en stock. Aucun concurrent ne fait ça de manière proactive.

2. **Scan de facture caviste**
   Photo d'un ticket ou d'une facture → import batch de toutes les bouteilles. CellarMate.ai le propose, mais personne d'autre. Énorme gain pour les achats en lot (cartons de 6/12).

3. **"Wine Memories" — Journal photo-vin**
   Associer une photo du moment (dîner, amis, lieu) à une bouteille bue. Transforme l'app utilitaire en app émotionnelle. Quand tu revois le Pommard 2018, tu vois aussi le dîner d'anniversaire.

### Moyen terme (V1-V2)

4. **Sommelier IA contextuel**
   "J'ai un gigot d'agneau ce soir, qu'est-ce que j'ouvre ?" → suggestion depuis TON inventaire, pas depuis une base générique. CellarMate.ai le fait depuis une base externe, mais pas depuis ta cave réelle.

5. **Mode "Party"**
   Tu reçois 8 personnes. L'app propose une sélection équilibrée (1 bulle, 2 blancs, 3 rouges) depuis ton stock, avec ordre de service et températures. Personne ne fait ça.

6. **Statistiques de consommation**
   Dashboard : bouteilles/mois, répartition couleur, domaines favoris, vitesse de rotation par zone. Gamification légère ("Tu as bu 3 Bourgognes ce mois-ci, nouveau record !").

### Long terme (différenciation structurelle)

7. **Reconnaissance de cave entière**
   Photo d'une étagère complète → identification de toutes les bouteilles visibles. CellarMate.ai l'annonce mais c'est embryonnaire. Avec Claude Vision, c'est techniquement faisable.

8. **Intégration cavistes locaux**
   Alertes quand ton caviste a un vin que tu as aimé, ou réapprovisionnement automatique des bouteilles que tu bois le plus. Modèle marketplace léger.

---

## Synthèse stratégique

Le marché des apps de cave est paradoxal : les apps les plus riches en features sont celles que les gens abandonnent le plus vite. CellarTracker est puissant mais sa complexité rebute. Vivino est populaire mais la cave est un ajout secondaire. InVintory est beau mais iOS-only et orienté grosses collections.

CaveScan se positionne sur le seul créneau réellement vide : **l'app de cave pour les gens qui ne veulent pas gérer une app de cave**. Le succès ne viendra pas d'ajouter des features, mais de maintenir la promesse de friction minimale tout en rendant chaque interaction mémorable.

Les 3 investissements prioritaires pour l'effet wahou :
1. **Smart Pour** (suggestion proactive) — personne ne le fait, forte valeur perçue
2. **Wine Memories** (journal photo-moment) — crée l'attachement émotionnel à l'app
3. **Sommelier IA sur ton stock** — question naturelle, réponse magique
