# Celestin Eval

Petit outil pour tester plusieurs scenarios Celestin d'un coup et generer un rapport lisible.

## Fichiers

- `evals/celestin-scenarios.json` : liste des questions a poser
- `evals/celestin-fixture.template.json` : modele de fixture, utile seulement pour comprendre le format ou faire un dry run
- `scripts/evaluate-celestin.mjs` : script d'execution

## Usage

### 1. Exporter la fixture depuis l'app

Depuis `Debug`, utilise le bouton `Exporter la fixture Celestin`.

Le fichier JSON telecharge correspond a l'utilisateur connecte dans l'app.
Il contient maintenant :

- la cave
- les degustations structurees
- les memory facts
- les resumes de sessions precedentes

Place ensuite ce fichier dans `evals/`, par exemple :

- `evals/celestin-fixture.rodol.json`

Le script CLI prend automatiquement la fixture exportee la plus recente dans `evals/`.
La template n'est plus utilisee par defaut pour une vraie evaluation.

### 2. Option manuelle

1. Copier `evals/celestin-fixture.template.json` en un vrai fichier de travail, par exemple :

```bash
cp evals/celestin-fixture.template.json evals/celestin-fixture.rodol.json
```

2. Remplir ce fichier avec :

- ta cave
- tes degustations structurees si tu veux tester le retrieval moderne
- ton profil
- tes souvenirs
- ton contexte

3. Lancer l'evaluation :

```bash
npm run eval:celestin -- --fixture evals/celestin-fixture.rodol.json
```

4. Ouvrir le rapport HTML genere dans `evals/results/`

## Important

Si tu modifies l'architecture memoire / retrieval de Celestin, re-exporte une fixture depuis `Debug` avant de relancer les evals.

Sinon tu risques de tester :

- le nouveau code
- avec une vieille fixture trop pauvre

et donc d'obtenir des faux echecs.

## Dry Run

Pour verifier la structure sans appeler l'API :

```bash
npm run eval:celestin -- --fixture evals/celestin-fixture.rodol.json --dry-run
```
