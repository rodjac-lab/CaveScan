alter table public.celestin_turn_observability
  add column if not exists frontend_recorded_at timestamptz,
  add column if not exists frontend_prep_ms integer check (frontend_prep_ms >= 0),
  add column if not exists frontend_celestin_ms integer check (frontend_celestin_ms >= 0),
  add column if not exists frontend_total_ms integer check (frontend_total_ms >= 0),
  add column if not exists frontend_memory_ms integer check (frontend_memory_ms >= 0),
  add column if not exists frontend_compiled_profile_ms integer check (frontend_compiled_profile_ms >= 0),
  add column if not exists frontend_classifier_ms integer check (frontend_classifier_ms >= 0);

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
  percentile_cont(0.5) within group (order by frontend_total_ms) as frontend_total_p50_ms,
  percentile_cont(0.95) within group (order by frontend_total_ms) as frontend_total_p95_ms,
  percentile_cont(0.5) within group (order by frontend_prep_ms) as frontend_prep_p50_ms,
  percentile_cont(0.95) within group (order by frontend_prep_ms) as frontend_prep_p95_ms,
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
  percentile_cont(0.5) within group (order by frontend_total_ms) as frontend_total_p50_ms,
  percentile_cont(0.95) within group (order by frontend_total_ms) as frontend_total_p95_ms,
  max(edge_ms) as max_edge_ms,
  max(frontend_total_ms) as max_frontend_total_ms,
  max(created_at) as last_turn_at
from public.celestin_turn_observability
where request_source = 'chat'
group by user_id
order by coalesce(
  percentile_cont(0.95) within group (order by frontend_total_ms),
  percentile_cont(0.95) within group (order by edge_ms)
) desc nulls last;

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
  frontend_total_ms,
  frontend_prep_ms,
  frontend_celestin_ms,
  frontend_memory_ms,
  frontend_compiled_profile_ms,
  tool_calls_count,
  tool_duration_ms,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  success,
  error_kind,
  error_message
from public.celestin_turn_observability
order by coalesce(frontend_total_ms, edge_ms) desc nulls last
limit 100;
