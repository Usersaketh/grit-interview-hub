-- Approve badge certification (additive migration)
-- Adds approve_badge_certification() RPC to transition CERTIFICATION_PENDING -> AWARDED.
-- No existing tables, columns, or RPCs modified.

-- ===========================================================================
-- Approve badge certification (staff only).
-- Allowed transition: CERTIFICATION_PENDING -> AWARDED.
-- Sets awarded_at = now(); does not touch external_award_id.
-- Idempotent, advisory-locked, audited, emits badge.certification.awarded outbox event.
-- ===========================================================================
create or replace function public.approve_badge_certification(
  p_badge_award_id uuid,
  p_idempotency_key text
)
returns public.badge_awards
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_award public.badge_awards;
  v_award_before public.badge_awards;
  v_existing public.idempotency_records;
  v_request_payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;

  if not public.is_staff() then
    raise exception 'staff_role_required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext(auth.uid()::text || ':' || p_idempotency_key));

  v_request_payload := jsonb_build_object(
    'badge_award_id', p_badge_award_id
  );

  select * into v_existing from public.idempotency_records
  where actor_id = auth.uid() and operation = 'approve_badge_certification' and key = p_idempotency_key;

  if found then
    if v_existing.request_payload is distinct from v_request_payload then
      raise exception 'idempotency_key_reused' using errcode = 'P0001';
    end if;
    select * into v_award from public.badge_awards where id = (v_existing.response->>'badge_award_id')::uuid;
    return v_award;
  end if;

  select * into v_award from public.badge_awards where id = p_badge_award_id for update of badge_awards;
  if not found then
    raise exception 'badge_award_not_found' using errcode = 'P0002';
  end if;

  if v_award.status is distinct from 'CERTIFICATION_PENDING' then
    raise exception 'badge_award_not_pending' using errcode = '23514';
  end if;

  v_award_before := v_award;

  update public.badge_awards
  set status = 'AWARDED',
      awarded_at = now()
  where id = v_award.id
  returning * into v_award;

  insert into public.idempotency_records(actor_id, operation, key, response, request_payload)
  values (auth.uid(), 'approve_badge_certification', p_idempotency_key,
    jsonb_build_object('badge_award_id', v_award.id), v_request_payload);

  insert into public.audit_logs(actor_id, entity_type, entity_id, action, previous_value, new_value, reason)
  values (auth.uid(), 'badge_award', v_award.id, 'APPROVED', to_jsonb(v_award_before), to_jsonb(v_award),
    'Badge certification approved');

  insert into public.integration_outbox(event_type, aggregate_type, aggregate_id, payload)
  values ('badge.certification.awarded', 'badge_award', v_award.id,
    jsonb_build_object('badge_award_id', v_award.id, 'student_id', v_award.student_id,
      'badge_id', v_award.badge_id, 'interview_result_id', v_award.interview_result_id));

  return v_award;
end;
$$;

-- ===========================================================================
-- Function permissions: revoke from PUBLIC and anon, grant to authenticated.
-- ===========================================================================
revoke execute on function public.approve_badge_certification(uuid, text) from public;
revoke execute on function public.approve_badge_certification(uuid, text) from anon;
grant execute on function public.approve_badge_certification(uuid, text) to authenticated;
