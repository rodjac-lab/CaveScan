# Celestin Eval

Petit outil pour tester plusieurs scenarios Celestin d'un coup et generer un rapport lisible.

## Fichiers

- `evals/celestin-scenarios.json` : liste des questions a poser
- `evals/celestin-fixture.template.json` : modele de contexte utilisateur/cave
- `scripts/evaluate-celestin.mjs` : script d'execution

## Usage

### 1. Exporter la fixture depuis l'app

Depuis `Reglages`, utilise le bouton `Exporter la fixture Celestin`.

Le fichier JSON telecharge correspond a l'utilisateur connecte dans l'app.

Place ensuite ce fichier dans `evals/`, par exemple :

- `evals/celestin-fixture.rodol.json`

### 2. Option manuelle

1. Copier `evals/celestin-fixture.template.json` en un vrai fichier de travail, par exemple :

```bash
cp evals/celestin-fixture.template.json evals/celestin-fixture.rodol.json
```

2. Remplir ce fichier avec :

- ta cave
- ton profil
- tes souvenirs
- ton contexte

3. Lancer l'evaluation :

```bash
npm run eval:celestin -- --fixture evals/celestin-fixture.rodol.json
```

4. Ouvrir le rapport HTML genere dans `evals/results/`

## Dry Run

Pour verifier la structure sans appeler l'API :

```bash
npm run eval:celestin -- --fixture evals/celestin-fixture.rodol.json --dry-run
```
