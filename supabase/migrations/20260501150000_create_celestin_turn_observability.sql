create extension if not exists pgcrypto with schema extensions;

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select encode(
    extensions.digest(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), 'sha256'),
    'hex'
  ) in (
    '5d807670b09421387072d62908be1c35ca69c7419019cb06c44d68949b1457b5'
  );
$$;

revoke all on function public.is_current_user_admin() from public;
grant execute on function public.is_current_user_admin() to authenticated;

drop policy if exists "Users can read own Celestin LLM usage" on public.celestin_llm_usage;

create table if not exists public.celestin_turn_observability (
  turn_id uuid primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  session_id uuid,
  request_source text,
  message_preview text,
  has_image boolean not null default false,
  success boolean not null default true,
  error_kind text,
  error_message text,
  route text,
  turn_type text,
  mode text,
  conversational_intent text,
  state_before_phase text,
  state_after_phase text,
  ui_action_kind text,
  provider text,
  provider_path text,
  provider_errors text[] not null default '{}',
  provider_attempts jsonb not null default '[]'::jsonb,
  edge_ms integer check (edge_ms >= 0),
  llm_ms integer check (llm_ms >= 0),
  tool_calls_count integer not null default 0 check (tool_calls_count >= 0),
  tool_duration_ms integer not null default 0 check (tool_duration_ms >= 0),
  tool_names text[] not null default '{}',
  prompt_system_chars integer check (prompt_system_chars >= 0),
  prompt_user_chars integer check (prompt_user_chars >= 0),
  prompt_context_chars integer check (prompt_context_chars >= 0),
  history_turns integer check (history_turns >= 0),
  provider_history_turns integer check (provider_history_turns >= 0),
  cave_count integer check (cave_count >= 0),
  memory_evidence_mode text,
  memory_focus text,
  compiled_profile boolean,
  cache_creation_input_tokens integer not null default 0 check (cache_creation_input_tokens >= 0),
  cache_read_input_tokens integer not null default 0 check (cache_read_input_tokens >= 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.celestin_turn_observability enable row level security;
alter table public.celestin_llm_usage enable row level security;

drop policy if exists "Admins can read Celestin turn observability" on public.celestin_turn_observability;
create policy "Admins can read Celestin turn observability"
  on public.celestin_turn_observability
  for select
  to authenticated
  using (public.is_current_user_admin());

drop policy if exists "Admins can read Celestin LLM usage" on public.celestin_llm_usage;
create policy "Admins can read Celestin LLM usage"
  on public.celestin_llm_usage
  for select
  to authenticated
  using (public.is_current_user_admin());

create index if not exists celestin_turn_observability_created_at_idx
  on public.celestin_turn_observability (created_at desc);

create index if not exists celestin_turn_observability_user_created_idx
  on public.celestin_turn_observability (user_id, created_at desc);

create index if not exists celestin_turn_observability_route_created_idx
  on public.celestin_turn_observability (route, created_at desc);

create index if not exists celestin_turn_observability_success_created_idx
  on public.celestin_turn_observability (success, created_at desc);

drop view if exists public.admin_celestin_daily_health_v;
create view public.admin_celestin_daily_health_v
with (security_invoker = true)
as
select
  date_trunc('day', created_at) as day,
  count(*)::integer as turns,
  count(*) filter (where success)::integer as successful_turns,
  count(*) filter (where not success)::integer as failed_turns,
  percentile_cont(0.5) within group (order by edge_ms) as edge_p50_ms,
  percentile_cont(0.95) within group (order by edge_ms) as edge_p95_ms,
  percentile_cont(0.5) within group (order by llm_ms) as llm_p50_ms,
  percentile_cont(0.95) within group (order by llm_ms) as llm_p95_ms,
  sum(input_tokens)::bigint as input_tokens,
  sum(output_tokens)::bigint as output_tokens,
  sum(cache_creation_input_tokens)::bigint as cache_creation_input_tokens,
  sum(cache_read_input_tokens)::bigint as cache_read_input_tokens,
  count(*) filter (where cache_read_input_tokens > 0)::integer as cache_read_turns,
  count(*) filter (where provider_path = 'fallback_response')::integer as fallback_turns,
  avg(tool_calls_count)::numeric(10, 2) as avg_tool_calls
from public.celestin_turn_observability
group by 1
order by 1 desc;

drop view if exists public.admin_celestin_cost_by_user_v;
create view public.admin_celestin_cost_by_user_v
with (security_invoker = true)
as
select
  user_id,
  count(*)::integer as turns,
  min(created_at) as first_turn_at,
  max(created_at) as last_turn_at,
  sum(input_tokens)::bigint as input_tokens,
  sum(output_tokens)::bigint as output_tokens,
  sum(cache_creation_input_tokens)::bigint as cache_creation_input_tokens,
  sum(cache_read_input_tokens)::bigint as cache_read_input_tokens,
  count(*) filter (where cache_read_input_tokens > 0)::integer as cache_read_turns,
  count(*) filter (where not success)::integer as failed_turns,
  percentile_cont(0.95) within group (order by edge_ms) as edge_p95_ms
from public.celestin_turn_observability
where request_source = 'chat'
group by user_id
order by (sum(input_tokens) + sum(output_tokens)) desc nulls last;

drop view if exists public.admin_celestin_latency_by_user_v;
create view public.admin_celestin_latency_by_user_v
with (security_invoker = true)
as
select
  user_id,
  count(*)::integer as turns,
  percentile_cont(0.5) within group (order by edge_ms) as edge_p50_ms,
  percentile_cont(0.95) within group (order by edge_ms) as edge_p95_ms,
  percentile_cont(0.5) within group (order by llm_ms) as llm_p50_ms,
  percentile_cont(0.95) within group (order by llm_ms) as llm_p95_ms,
  max(edge_ms) as max_edge_ms,
  max(created_at) as last_turn_at
from public.celestin_turn_observability
where request_source = 'chat'
group by user_id
order by edge_p95_ms desc nulls last;

drop view if exists public.admin_celestin_slow_turns_v;
create view public.admin_celestin_slow_turns_v
with (security_invoker = true)
as
select
  created_at,
  turn_id,
  user_id,
  request_source,
  message_preview,
  route,
  turn_type,
  mode,
  provider,
  provider_path,
  edge_ms,
  llm_ms,
  tool_calls_count,
  tool_duration_ms,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  success,
  error_kind,
  error_message
from public.celestin_turn_observability
order by edge_ms desc nulls last
limit 100;

drop view if exists public.admin_celestin_errors_v;
create view public.admin_celestin_errors_v
with (security_invoker = true)
as
select
  created_at,
  turn_id,
  user_id,
  request_source,
  message_preview,
  route,
  turn_type,
  mode,
  provider,
  provider_errors,
  error_kind,
  error_message
from public.celestin_turn_observability
where not success or coalesce(array_length(provider_errors, 1), 0) > 0
order by created_at desc
limit 100;

grant select on
  public.admin_celestin_daily_health_v,
  public.admin_celestin_cost_by_user_v,
  public.admin_celestin_latency_by_user_v,
  public.admin_celestin_slow_turns_v,
  public.admin_celestin_errors_v
to authenticated;
