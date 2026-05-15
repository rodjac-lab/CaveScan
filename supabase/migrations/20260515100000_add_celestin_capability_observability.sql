alter table public.celestin_turn_observability
  add column if not exists orchestration_version text not null default 'v1',
  add column if not exists capability text,
  add column if not exists confidence numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  add column if not exists action_contract text,
  add column if not exists response_mode text;

create index if not exists celestin_turn_observability_capability_created_idx
  on public.celestin_turn_observability (capability, created_at desc);

create index if not exists celestin_turn_observability_orchestration_created_idx
  on public.celestin_turn_observability (orchestration_version, created_at desc);

drop view if exists public.admin_celestin_capability_health_v;
create view public.admin_celestin_capability_health_v
with (security_invoker = true)
as
select
  date_trunc('day', created_at) as day,
  coalesce(orchestration_version, 'v1') as orchestration_version,
  coalesce(capability, 'UNKNOWN') as capability,
  count(*)::integer as turns,
  count(*) filter (where success)::integer as successful_turns,
  count(*) filter (where not success)::integer as failed_turns,
  count(*) filter (where provider_path = 'fallback_response')::integer as fallback_turns,
  count(*) filter (where ui_action_kind = 'show_recommendations')::integer as recommendation_card_turns,
  avg(confidence)::numeric(4, 3) as avg_confidence,
  percentile_cont(0.5) within group (order by edge_function_ms) as edge_function_p50_ms,
  percentile_cont(0.95) within group (order by edge_function_ms) as edge_function_p95_ms,
  percentile_cont(0.5) within group (order by llm_ms) as llm_p50_ms,
  percentile_cont(0.95) within group (order by llm_ms) as llm_p95_ms,
  sum(input_tokens)::bigint as input_tokens,
  sum(output_tokens)::bigint as output_tokens,
  avg(tool_calls_count)::numeric(10, 2) as avg_tool_calls
from public.celestin_turn_observability
where request_source in ('chat', 'cli_eval', 'debug_or_eval')
group by 1, 2, 3
order by 1 desc, 2, 3;

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
  orchestration_version,
  capability,
  confidence,
  action_contract,
  response_mode,
  provider,
  provider_path,
  edge_ms,
  edge_function_ms,
  edge_request_parse_ms,
  edge_auth_ms,
  edge_runtime_ms,
  edge_isolate_age_ms,
  edge_invocation_index,
  edge_cold_start,
  edge_function_region,
  llm_ms,
  frontend_total_ms,
  frontend_prep_ms,
  frontend_celestin_ms,
  frontend_memory_ms,
  frontend_compiled_profile_ms,
  case
    when frontend_celestin_ms is not null and edge_function_ms is not null
      then frontend_celestin_ms - edge_function_ms
    else null
  end as browser_overhead_ms,
  tool_calls_count,
  tool_duration_ms,
  input_tokens,
  output_tokens,
  cache_read_input_tokens,
  success,
  error_kind,
  error_message
from public.celestin_turn_observability
order by coalesce(frontend_total_ms, edge_function_ms, edge_ms) desc nulls last
limit 100;

grant select on
  public.admin_celestin_capability_health_v,
  public.admin_celestin_slow_turns_v
to authenticated;
