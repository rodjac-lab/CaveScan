# autoDream — Consolidation mémoire pour Célestin

## Contexte

Célestin a un système de mémoire conversationnelle basé sur `user_memory_facts` (table Supabase). Ces facts sont extraits automatiquement après chaque session par l'Edge Function `extract-chat-insights`. Le problème : les facts ne font que s'accumuler sans jamais être nettoyés, fusionnés ou renforcés. Après N sessions, on se retrouve avec des doublons, des facts vagues jamais remplacés par des signaux plus précis, des temporaires expirés non purgés, et des contradictions non résolues.

autoDream est un processus de consolidation inspiré de l'architecture mémoire de Claude Code (autoDream/background consolidation). Il tourne en isolation (Edge Function séparée), ne touche que le Layer 1 (`user_memory_facts`), et maintient un index mémoire propre et compact.

## Spec fonctionnelle

### Trigger

- **Déclenchement** : après 5 sessions complétées (pas un cron).
- **Mécanisme** : `extract-chat-insights` incrémente un compteur dans une table/colonne dédiée. Quand le compteur atteint 5, il invoque `autodream` puis reset le compteur.
- **Table** : ajouter une table `autodream_state` avec colonnes : `user_id`, `sessions_since_last_run` (int, default 0), `last_run_at` (timestamptz), `is_running` (boolean, default false).

### Lock / Concurrence

- **Lock simple** : avant de démarrer, autoDream set `is_running = true` sur la ligne de l'utilisateur. Si déjà `true`, skip (un cycle est déjà en cours).
- **Unlock** : set `is_running = false` à la fin (dans un `finally` pour garantir l'unlock même en cas d'erreur).
- **Pas de conflit write** : autoDream travaille sur un snapshot des facts au début. Les facts extraits pendant l'exécution seront traités au prochain cycle.

### Scope

- **Layer 1 uniquement** : `user_memory_facts`.
- Ne touche PAS aux `chat_sessions`, `chat_messages`, ni aux `bottles`.

### LLM

- **Modèle** : Gemini 2.5 Flash (via le provider Google existant dans `celestinWithFallback`).
- **Température** : 0.3 (plus déterministe que Célestin conversationnel).
- **Pas de fallback** : si Gemini échoue, log l'erreur et abort le cycle proprement (unlock + log). On retente au prochain trigger.

### Rollback / Soft-delete

- **Table `autodream_archive`** : `id`, `user_id`, `run_id` (uuid du cycle), `original_fact_id`, `original_data` (jsonb — snapshot complet du fact), `action` (enum: 'merged', 'pruned', 'superseded'), `merged_into_fact_id` (nullable), `archived_at` (timestamptz).
- **Avant toute modification**, le fact original est copié dans `autodream_archive`.
- Les facts archivés sont supprimés de `user_memory_facts` (hard delete — la copie est dans l'archive).
- Pour restaurer : recréer depuis `autodream_archive` + supprimer les facts fusionnés créés par ce run.

### Observabilité / Logging

- **Table `autodream_logs`** : `id`, `user_id`, `run_id`, `started_at`, `completed_at`, `status` (enum: 'running', 'completed', 'failed', 'skipped'), `facts_before` (int), `facts_after` (int), `merged_count` (int), `pruned_count` (int), `error_message` (text, nullable), `details` (jsonb — détail des actions).
- **Debug in-app** : le frontend peut lire `autodream_logs` pour afficher un résumé dans un mode debug/admin (pas de UI spécifique à construire maintenant, juste s'assurer que la donnée est là).

## Les 4 phases

### Phase 1 — Orient

Charger tous les `user_memory_facts` actifs de l'utilisateur (non superseded, non archived). Grouper par catégorie (`preference`, `aversion`, `context`, `life_event`, `wine_knowledge`, `social`, `cellar_intent`). Compter. C'est le snapshot de travail.

Aussi : identifier les facts temporaires dont `expires_at < now()` — ceux-là seront purgés directement en Phase 4 sans passer par le LLM.

### Phase 2 — Gather

Charger les `previousSessionSummaries` des sessions depuis le dernier `last_run_at` (ou toutes si premier run). Ces summaries donnent du contexte au LLM pour comprendre l'évolution récente des préférences.

Ce contexte est passé au LLM en Phase 3, pas stocké.

### Phase 3 — Consolidate

Appel LLM (Gemini Flash). Le prompt doit :

1. **Recevoir** : la liste complète des facts actifs (id + category + content + source_quote + created_at) + les summaries récentes.

2. **Produire un JSON structuré** avec les actions à effectuer :

```json
{
  "actions": [
    {
      "type": "merge",
      "source_fact_ids": ["uuid1", "uuid2", "uuid3"],
      "merged_content": "Adore les Gamay de cru, particulièrement Morgon et Fleurie. Sensibilité prix 10-18€.",
      "merged_category": "preference",
      "confidence": "high",
      "reasoning": "3 facts convergents sur les Gamay/Beaujolais crus"
    },
    {
      "type": "prune",
      "fact_id": "uuid4",
      "reasoning": "Fact vague ('aime le rouge') entièrement subsumé par des préférences plus spécifiques"
    },
    {
      "type": "update",
      "fact_id": "uuid5",
      "updated_content": "Préfère les blancs minéraux et tendus, pas les blancs boisés",
      "reasoning": "Reformulation pour préciser — sessions récentes confirment cette nuance"
    },
    {
      "type": "keep",
      "fact_id": "uuid6",
      "reasoning": "Fact unique et spécifique, pas de redondance"
    }
  ]
}
```

3. **Règles pour le LLM** (à mettre dans le system prompt de l'appel) :
   - **Ne jamais inventer** de préférences non supportées par les facts existants.
   - **Conserver le source_quote** du fact le plus récent dans un merge.
   - **En cas de contradiction** (aime X + n'aime plus X), garder le plus récent et pruner l'ancien.
   - **Convertir le vague en précis** seulement si des facts plus spécifiques existent.
   - **Ne pas toucher aux facts de catégorie `context` ou `life_event`** sauf s'ils sont clairement expirés ou contradictoires.
   - **Maximum 50% de réduction par cycle** — ne pas trop compresser d'un coup, la consolidation est progressive.
   - **Chaque action doit avoir un `reasoning`** — c'est le log principal.

### Phase 4 — Prune & Apply

Exécuter les actions dans l'ordre :

1. **Purger les temporaires expirés** (identifiés en Phase 1) : archiver puis supprimer.
2. **Pour chaque action `merge`** :
   - Archiver tous les `source_fact_ids` dans `autodream_archive` avec action='merged'.
   - Créer un nouveau fact avec `merged_content`, catégorie, et `source_quote` du fact le plus récent. Marquer `created_by = 'autodream'`.
   - Supprimer les facts source.
3. **Pour chaque action `prune`** :
   - Archiver le fact avec action='pruned'.
   - Supprimer.
4. **Pour chaque action `update`** :
   - Archiver l'ancien fact avec action='superseded'.
   - Mettre à jour le contenu du fact in-place (update, pas insert+delete).
5. **Actions `keep`** : ne rien faire (le reasoning est logué dans `autodream_logs.details`).

Toutes les opérations DB dans une **transaction Supabase** — si une étape échoue, rollback complet.

## Fichiers à créer

```
supabase/functions/autodream/index.ts     — Edge Function principale
supabase/functions/autodream/phases.ts    — Logique des 4 phases
supabase/functions/autodream/prompts.ts   — System prompt + user prompt pour le LLM
supabase/functions/autodream/types.ts     — Types TypeScript
supabase/migrations/XXXXX_autodream.sql   — Tables autodream_state, autodream_archive, autodream_logs
```

## Fichiers à modifier

```
supabase/functions/extract-chat-insights/index.ts
  → Ajouter : incrémenter sessions_since_last_run dans autodream_state
  → Ajouter : si compteur >= 5, invoquer la fonction autodream (fire-and-forget) puis reset compteur

supabase/functions/celestin/index.ts (ou shared/)
  → Si le provider Google/Gemini est dans un module partagé, autoDream doit pouvoir l'importer.
  → Sinon, dupliquer la config provider Gemini dans autodream (acceptable en V1).
```

## Migration SQL

```sql
-- Table d'état autodream par utilisateur
create table if not exists autodream_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sessions_since_last_run int not null default 0,
  last_run_at timestamptz,
  is_running boolean not null default false
);

alter table autodream_state enable row level security;
create policy "Users can read own state" on autodream_state for select using (auth.uid() = user_id);

-- Table d'archive (rollback)
create table if not exists autodream_archive (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null,
  original_fact_id uuid not null,
  original_data jsonb not null,
  action text not null check (action in ('merged', 'pruned', 'superseded')),
  merged_into_fact_id uuid,
  archived_at timestamptz not null default now()
);

alter table autodream_archive enable row level security;
create policy "Users can read own archive" on autodream_archive for select using (auth.uid() = user_id);
create index idx_autodream_archive_user_run on autodream_archive(user_id, run_id);

-- Table de logs
create table if not exists autodream_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'skipped')),
  facts_before int,
  facts_after int,
  merged_count int default 0,
  pruned_count int default 0,
  error_message text,
  details jsonb
);

alter table autodream_logs enable row level security;
create policy "Users can read own logs" on autodream_logs for select using (auth.uid() = user_id);
create index idx_autodream_logs_user on autodream_logs(user_id, started_at desc);
```

## Contraintes d'implémentation

- **Pas de nouveaux packages npm** — utiliser les dépendances déjà présentes.
- **Respecter le pattern des Edge Functions existantes** — même structure que `extract-chat-insights` et `celestin`.
- **Le provider Gemini est déjà configuré** dans le code Célestin — réutiliser la même config (API key depuis env vars, même format de requête).
- **Tous les appels Supabase doivent utiliser le service_role key** (c'est une fonction serveur, pas un appel client).
- **Ajouter `created_by` à `user_memory_facts`** si la colonne n'existe pas — valeurs possibles : 'extraction' (défaut/existant), 'autodream' (nouveau). Ceci permet de distinguer les facts originaux des facts consolidés.
- **Le fire-and-forget depuis extract-chat-insights** : utiliser `fetch()` vers l'URL de la fonction autodream avec `waitUntil` ou sans `await` — on ne veut pas bloquer la réponse de l'extraction.

## Tests manuels attendus

Après implémentation, vérifier :

1. Créer manuellement 10+ facts pour un utilisateur test, dont des doublons évidents et des temporaires expirés.
2. Simuler le trigger (set `sessions_since_last_run = 5`).
3. Invoquer `autodream` manuellement via curl.
4. Vérifier : facts fusionnés correctement, archive peuplée, logs complets, lock relâché.
5. Vérifier : les facts archivés ne sont plus retournés par les queries normales du frontend.
6. Vérifier : un second appel immédiat est skippé (lock).
