create table if not exists public.celestin_llm_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  turn_id uuid,
  request_source text,
  caller text not null,
  provider text not null default 'anthropic',
  model text not null,
  route text,
  turn_type text,
  mode text,
  provider_path text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cache_creation_input_tokens integer not null default 0 check (cache_creation_input_tokens >= 0),
  cache_read_input_tokens integer not null default 0 check (cache_read_input_tokens >= 0),
  tools_enabled boolean,
  tools_included boolean,
  tool_choice text,
  message_preview text,
  raw_usage jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.celestin_llm_usage enable row level security;

drop policy if exists "Users can read own Celestin LLM usage" on public.celestin_llm_usage;
create policy "Users can read own Celestin LLM usage"
  on public.celestin_llm_usage
  for select
  to authenticated
  using (auth.uid() = user_id);

create index if not exists celestin_llm_usage_created_at_idx
  on public.celestin_llm_usage (created_at desc);

create index if not exists celestin_llm_usage_turn_id_idx
  on public.celestin_llm_usage (turn_id);

create index if not exists celestin_llm_usage_source_caller_created_idx
  on public.celestin_llm_usage (request_source, caller, created_at desc);

create index if not exists celestin_llm_usage_route_created_idx
  on public.celestin_llm_usage (route, created_at desc);
