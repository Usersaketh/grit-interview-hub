-- Malpractice flagging and badge nullification workflow
-- Additive migration: new RPCs and RLS policies only; no existing tables modified.
-- No direct table SELECT grants are issued to authenticated/anon/PUBLIC.
-- All six malpractice RPCs are SECURITY DEFINER with EXECUTE granted only to authenticated.

-- RLS policy: staff can manage all malpractice reports (defense in depth).
create policy "malpractice reports staff" on public.malpractice_reports
  for all using (public.is_staff()) with check (public.is_staff());

-- ===========================================================================
-- Create malpractice report (staff only)
-- Idempotency order: advisory lock -> canonical payload -> idempotency check
-- -> replay -> mutable state validation -> mutation -> audit -> outbox.
-- ===========================================================================
create or replace function public.create_malpractice_report(
  p_student_id uuid,
  p_badge_id uuid,
  p_reason_code text,
  p_description text,
  p_evidence_reference text,
  p_idempotency_key text
)
returns public.malpractice_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_badge public.badges;
  v_report public.malpractice_reports;
  v_report_before public.malpractice_reports;
  v_existing public.idempotency_records;
  v_request_payload jsonb;
  v_constraint_name text;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;

  if p_reason_code is null or btrim(p_reason_code) = '' then
    raise exception 'reason_code_required' using errcode = '22023';
  end if;

  if p_description is null or btrim(p_description) = '' then
    raise exception 'description_required' using errcode = '22023';
  end if;

  if not public.is_staff() then
    raise exception 'staff_role_required' using errcode = '42501';
  end if;

  -- 1. Serialize retries for the same actor and idempotency key.
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text || ':' || p_idempotency_key));

  -- 2. Build canonical request payload.
  v_request_payload := jsonb_build_object(
    'student_id', p_student_id,
    'badge_id', p_badge_id,
    'reason_code', p_reason_code,
    'description', p_description,
    'evidence_reference', p_evidence_reference
  );

  -- 3. Check idempotency record BEFORE validating mutable workflow state.
  select * into v_existing from public.idempotency_records
  where actor_id = auth.uid() and operation = 'create_malpractice_report' and key = p_idempotency_key;

  if found then
    if v_existing.request_payload is distinct from v_request_payload then
      raise exception 'idempotency_key_reused' using errcode = 'P0001';
    end if;
    select * into v_report from public.malpractice_reports where id = (v_existing.response->>'report_id')::uuid;
    return v_report;
  end if;

  -- 4. Validate mutable workflow state (after idempotency check).
  select * into v_student from public.students where id = p_student_id;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  select * into v_badge from public.badges where id = p_badge_id and is_active = true;
  if not found then
    raise exception 'badge_not_found_or_inactive' using errcode = '23514';
  end if;

  -- 5. Prevent duplicate outstanding cases for the same student and badge.
  select * into v_report from public.malpractice_reports
  where student_id = p_student_id and badge_id = p_badge_id
    and status in ('REPORTED', 'UNDER_REVIEW', 'CONFIRMED', 'APPEALED')
  for update of malpractice_reports;
  if found then
    raise exception 'outstanding_malpractice_case' using errcode = '23514';
  end if;

  -- 6. Insert report.
  insert into public.malpractice_reports(
    student_id, badge_id, reported_by, reason_code, description, evidence_reference, status
  )
  values (
    p_student_id, p_badge_id, auth.uid(), p_reason_code, p_description, p_evidence_reference, 'REPORTED'
  )
  returning * into v_report;

  -- 7. Idempotency record.
  insert into public.idempotency_records(actor_id, operation, key, response, request_payload)
  values (auth.uid(), 'create_malpractice_report', p_idempotency_key,
    jsonb_build_object('report_id', v_report.id), v_request_payload);

  -- 8. Audit log.
  insert into public.audit_logs(actor_id, entity_type, entity_id, action, new_value, reason)
  values (auth.uid(), 'malpractice_report', v_report.id, 'CREATED', to_jsonb(v_report),
    p_reason_code || ': ' || p_description);

  -- 9. Outbox event.
  insert into public.integration_outbox(event_type, aggregate_type, aggregate_id, payload)
  values ('malpractice.reported', 'malpractice_report', v_report.id,
    jsonb_build_object('report_id', v_report.id, 'student_id', p_student_id, 'badge_id', p_badge_id));

  return v_report;
exception when unique_violation then
  get stacked diagnostics v_constraint_name = constraint_name;
  if v_constraint_name = 'malpractice_reports_one_outstanding_per_student_badge' then
    raise exception 'outstanding_malpractice_case' using errcode = '23514';
  else
    raise;
  end if;
end;
$$;

-- ===========================================================================
-- Review malpractice report (staff only)
-- Valid transitions:
--   REPORTED -> UNDER_REVIEW
--   UNDER_REVIEW -> DISMISSED
--   UNDER_REVIEW -> CONFIRMED
--   CONFIRMED -> APPEALED
--   APPEALED -> CONFIRMED  (appeal rejection: report stays outstanding, no award change)
-- Reporter cannot review their own case.
-- ===========================================================================
create or replace function public.review_malpractice_report(
  p_report_id uuid,
  p_to_status public.malpractice_status,
  p_reviewer_notes text,
  p_idempotency_key text
)
returns public.malpractice_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.malpractice_reports;
  v_report_before public.malpractice_reports;
  v_existing public.idempotency_records;
  v_request_payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;

  if p_to_status is null then
    raise exception 'to_status_required' using errcode = '22023';
  end if;

  if not public.is_staff() then
    raise exception 'staff_role_required' using errcode = '42501';
  end if;

  -- 1. Serialize retries for the same actor and idempotency key.
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text || ':' || p_idempotency_key));

  -- 2. Build canonical request payload.
  v_request_payload := jsonb_build_object(
    'report_id', p_report_id,
    'to_status', p_to_status,
    'reviewer_notes', p_reviewer_notes
  );

  -- 3. Check idempotency record BEFORE validating mutable workflow state.
  select * into v_existing from public.idempotency_records
  where actor_id = auth.uid() and operation = 'review_malpractice_report' and key = p_idempotency_key;

  if found then
    if v_existing.request_payload is distinct from v_request_payload then
      raise exception 'idempotency_key_reused' using errcode = 'P0001';
    end if;
    select * into v_report from public.malpractice_reports where id = (v_existing.response->>'report_id')::uuid;
    return v_report;
  end if;

  -- 4. Lock and load the report for update.
  select * into v_report from public.malpractice_reports where id = p_report_id
  for update of malpractice_reports;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0002';
  end if;

  -- 5. Reporter cannot review their own case.
  if v_report.reported_by = auth.uid() then
    raise exception 'reporter_cannot_review_own_case' using errcode = '42501';
  end if;

  -- 6. Validate state transition.
  if v_report.status = 'REPORTED' and p_to_status <> 'UNDER_REVIEW' then
    raise exception 'invalid_transition' using errcode = '23514';
  end if;

  if v_report.status = 'UNDER_REVIEW' and p_to_status not in ('DISMISSED', 'CONFIRMED') then
    raise exception 'invalid_transition' using errcode = '23514';
  end if;

  if v_report.status = 'CONFIRMED' and p_to_status <> 'APPEALED' then
    raise exception 'invalid_transition' using errcode = '23514';
  end if;

  if v_report.status = 'APPEALED' and p_to_status <> 'CONFIRMED' then
    raise exception 'invalid_transition' using errcode = '23514';
  end if;

  if v_report.status in ('DISMISSED', 'REINSTATED') then
    raise exception 'invalid_transition' using errcode = '23514';
  end if;

  -- 7. Capture original state BEFORE mutation.
  v_report_before := v_report;

  -- 8. Update report.
  update public.malpractice_reports
  set status = p_to_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      reviewer_notes = p_reviewer_notes
  where id = p_report_id
  returning * into v_report;

  -- 9. Idempotency record.
  insert into public.idempotency_records(actor_id, operation, key, response, request_payload)
  values (auth.uid(), 'review_malpractice_report', p_idempotency_key,
    jsonb_build_object('report_id', v_report.id), v_request_payload);

  -- 10. Audit log: true original in previous_value, updated row in new_value.
  insert into public.audit_logs(actor_id, entity_type, entity_id, action, previous_value, new_value, reason)
  values (auth.uid(), 'malpractice_report', v_report.id, 'REVIEWED', to_jsonb(v_report_before), to_jsonb(v_report),
    v_report_before.status::text || ' -> ' || p_to_status::text || ': ' || coalesce(p_reviewer_notes, ''));

  -- 11. Outbox event.
  insert into public.integration_outbox(event_type, aggregate_type, aggregate_id, payload)
  values ('malpractice.reviewed', 'malpractice_report', v_report.id,
    jsonb_build_object('report_id', v_report.id, 'status', p_to_status, 'student_id', v_report.student_id, 'badge_id', v_report.badge_id));

  return v_report;
end;
$$;

-- ===========================================================================
-- Nullify badge award (staff only)
-- Only a CONFIRMED report can trigger nullification.
-- Only an AWARDED badge award can be nullified.
-- Original interview result is never modified.
-- ===========================================================================
create or replace function public.nullify_badge_award(
  p_report_id uuid,
  p_idempotency_key text
)
returns public.badge_awards
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.malpractice_reports;
  v_award public.badge_awards;
  v_award_before public.badge_awards;
  v_existing public.idempotency_records;
  v_request_payload jsonb;
  v_award_count integer;
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

  -- 1. Serialize retries for the same actor and idempotency key.
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text || ':' || p_idempotency_key));

  -- 2. Build canonical request payload.
  v_request_payload := jsonb_build_object(
    'report_id', p_report_id
  );

  -- 3. Check idempotency record BEFORE validating mutable workflow state.
  select * into v_existing from public.idempotency_records
  where actor_id = auth.uid() and operation = 'nullify_badge_award' and key = p_idempotency_key;

  if found then
    if v_existing.request_payload is distinct from v_request_payload then
      raise exception 'idempotency_key_reused' using errcode = 'P0001';
    end if;
    select * into v_award from public.badge_awards where id = (v_existing.response->>'badge_award_id')::uuid;
    return v_award;
  end if;

  -- 4. Lock and load the report.
  select * into v_report from public.malpractice_reports where id = p_report_id
  for update of malpractice_reports;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0002';
  end if;

  -- 5. Only a CONFIRMED report can trigger nullification.
  if v_report.status <> 'CONFIRMED' then
    raise exception 'report_not_confirmed' using errcode = '23514';
  end if;

  -- 6. Count matching awarded awards; fail on ambiguity.
  select count(*) into v_award_count from public.badge_awards
  where student_id = v_report.student_id and badge_id = v_report.badge_id
    and status = 'AWARDED';

  if v_award_count = 0 then
    raise exception 'no_awarded_badge_to_nullify' using errcode = '23514';
  end if;

  if v_award_count > 1 then
    raise exception 'ambiguous_award_selection' using errcode = '23514';
  end if;

  -- 7. Lock and load the single matching award.
  select * into v_award from public.badge_awards
  where student_id = v_report.student_id and badge_id = v_report.badge_id
    and status = 'AWARDED'
  for update of badge_awards;

  -- 8. Capture previous value for audit before mutation.
  v_award_before := v_award;

  -- 9. Nullify award.
  update public.badge_awards
  set status = 'NULLIFIED',
      nullified_at = now()
  where id = v_award.id
  returning * into v_award;

  -- 10. Idempotency record.
  insert into public.idempotency_records(actor_id, operation, key, response, request_payload)
  values (auth.uid(), 'nullify_badge_award', p_idempotency_key,
    jsonb_build_object('badge_award_id', v_award.id), v_request_payload);

  -- 11. Audit log.
  insert into public.audit_logs(actor_id, entity_type, entity_id, action, previous_value, new_value, reason)
  values (auth.uid(), 'badge_award', v_award.id, 'NULLIFIED', to_jsonb(v_award_before), to_jsonb(v_award),
    'Confirmed malpractice report ' || p_report_id::text);

  -- 12. Outbox event.
  insert into public.integration_outbox(event_type, aggregate_type, aggregate_id, payload)
  values ('badge.certification.nullified', 'badge_award', v_award.id,
    jsonb_build_object('badge_award_id', v_award.id, 'student_id', v_award.student_id,
      'badge_id', v_award.badge_id, 'report_id', p_report_id, 'reason_code', v_report.reason_code));

  return v_award;
end;
$$;

-- ===========================================================================
-- Reinstate badge award (staff only)
-- Only a NULLIFIED badge award can be reinstated.
-- Reinstatement requires an APPEALED malpractice report.
-- Transitions the report from APPEALED to REINSTATED.
-- Original nullification history is preserved.
-- ===========================================================================
create or replace function public.reinstate_badge_award(
  p_report_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns public.badge_awards
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.malpractice_reports;
  v_report_before public.malpractice_reports;
  v_award public.badge_awards;
  v_award_before public.badge_awards;
  v_existing public.idempotency_records;
  v_request_payload jsonb;
  v_award_count integer;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  if not public.is_staff() then
    raise exception 'staff_role_required' using errcode = '42501';
  end if;

  -- 1. Serialize retries for the same actor and idempotency key.
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text || ':' || p_idempotency_key));

  -- 2. Build canonical request payload.
  v_request_payload := jsonb_build_object(
    'report_id', p_report_id,
    'reason', p_reason
  );

  -- 3. Check idempotency record BEFORE validating mutable workflow state.
  select * into v_existing from public.idempotency_records
  where actor_id = auth.uid() and operation = 'reinstate_badge_award' and key = p_idempotency_key;

  if found then
    if v_existing.request_payload is distinct from v_request_payload then
      raise exception 'idempotency_key_reused' using errcode = 'P0001';
    end if;
    select * into v_award from public.badge_awards where id = (v_existing.response->>'badge_award_id')::uuid;
    return v_award;
  end if;

  -- 4. Lock and load the report.
  select * into v_report from public.malpractice_reports where id = p_report_id
  for update of malpractice_reports;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0002';
  end if;

  -- 5. Reinstatement requires an APPEALED report (resolved, not outstanding confirmed).
  if v_report.status <> 'APPEALED' then
    raise exception 'report_not_appealed' using errcode = '23514';
  end if;

  -- 6. Capture original report state BEFORE mutation.
  v_report_before := v_report;

  -- 7. Count matching nullified awards; fail on ambiguity.
  select count(*) into v_award_count from public.badge_awards
  where student_id = v_report.student_id and badge_id = v_report.badge_id
    and status = 'NULLIFIED';

  if v_award_count = 0 then
    raise exception 'no_nullified_badge_to_reinstate' using errcode = '23514';
  end if;

  if v_award_count > 1 then
    raise exception 'ambiguous_award_selection' using errcode = '23514';
  end if;

  -- 8. Lock and load the single matching award.
  select * into v_award from public.badge_awards
  where student_id = v_report.student_id and badge_id = v_report.badge_id
    and status = 'NULLIFIED'
  for update of badge_awards;

  -- 9. Capture previous award value for audit before mutation.
  v_award_before := v_award;

  -- 10. Reinstate award.
  update public.badge_awards
  set status = 'REINSTATED',
      reinstated_at = now()
  where id = v_award.id
  returning * into v_award;

  -- 11. Transition report from APPEALED to REINSTATED.
  update public.malpractice_reports
  set status = 'REINSTATED',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      reviewer_notes = p_reason
  where id = p_report_id
  returning * into v_report;

  -- 12. Reinstatement history row.
  insert into public.badge_reinstatements(badge_award_id, malpractice_report_id, reason, approved_by)
  values (v_award.id, p_report_id, p_reason, auth.uid());

  -- 13. Idempotency record.
  insert into public.idempotency_records(actor_id, operation, key, response, request_payload)
  values (auth.uid(), 'reinstate_badge_award', p_idempotency_key,
    jsonb_build_object('badge_award_id', v_award.id), v_request_payload);

  -- 14. Audit log for award.
  insert into public.audit_logs(actor_id, entity_type, entity_id, action, previous_value, new_value, reason)
  values (auth.uid(), 'badge_award', v_award.id, 'REINSTATED', to_jsonb(v_award_before), to_jsonb(v_award),
    p_reason);

  -- 15. Audit log for report transition.
  insert into public.audit_logs(actor_id, entity_type, entity_id, action, previous_value, new_value, reason)
  values (auth.uid(), 'malpractice_report', v_report.id, 'REINSTATED', to_jsonb(v_report_before), to_jsonb(v_report),
    v_report_before.status::text || ' -> REINSTATED: ' || p_reason);

  -- 16. Outbox event.
  insert into public.integration_outbox(event_type, aggregate_type, aggregate_id, payload)
  values ('badge.certification.reinstated', 'badge_award', v_award.id,
    jsonb_build_object('badge_award_id', v_award.id, 'student_id', v_award.student_id,
      'badge_id', v_award.badge_id, 'report_id', p_report_id));

  return v_award;
end;
$$;

-- ===========================================================================
-- Function permissions: revoke from PUBLIC and anon, grant to authenticated.
-- ===========================================================================
revoke execute on function public.create_malpractice_report(uuid, uuid, text, text, text, text) from public;
revoke execute on function public.create_malpractice_report(uuid, uuid, text, text, text, text) from anon;
revoke execute on function public.review_malpractice_report(uuid, public.malpractice_status, text, text) from public;
revoke execute on function public.review_malpractice_report(uuid, public.malpractice_status, text, text) from anon;
revoke execute on function public.nullify_badge_award(uuid, text) from public;
revoke execute on function public.nullify_badge_award(uuid, text) from anon;
revoke execute on function public.reinstate_badge_award(uuid, text, text) from public;
revoke execute on function public.reinstate_badge_award(uuid, text, text) from anon;

grant execute on function public.create_malpractice_report(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.review_malpractice_report(uuid, public.malpractice_status, text, text) to authenticated;
grant execute on function public.nullify_badge_award(uuid, text) to authenticated;
grant execute on function public.reinstate_badge_award(uuid, text, text) to authenticated;
