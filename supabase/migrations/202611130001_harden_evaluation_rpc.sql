create or replace function public.submit_interview_result(
  p_interview_id uuid,
  p_outcome public.evaluation_outcome,
  p_feedback text,
  p_retake_after timestamptz,
  p_idempotency_key text
)
returns public.interview_results
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_interviewer uuid;
  v_interview public.interviews;
  v_existing public.interview_results;
  v_result public.interview_results;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;

  if p_outcome is null then
    raise exception 'outcome_required' using errcode = '22023';
  end if;

  if p_outcome = 'RETAKE_LATER' and p_retake_after is null then
    raise exception 'retake_after_required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(auth.uid()::text || ':' || p_idempotency_key)
  );

  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
  ) then
    raise exception 'profile_inactive' using errcode = '42501';
  end if;

  select i.id
  into v_interviewer
  from public.interviewers i
  where i.user_id = auth.uid()
    and i.is_active = true;

  if v_interviewer is null then
    raise exception 'interviewer_role_required' using errcode = '42501';
  end if;

  select *
  into v_interview
  from public.interviews
  where id = p_interview_id
  for update;

  if not found then
    raise exception 'interview_not_found' using errcode = 'P0002';
  end if;

  if v_interview.interviewer_id <> v_interviewer then
    raise exception 'not_assigned_interviewer' using errcode = '42501';
  end if;

  select *
  into v_existing
  from public.interview_results
  where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.interview_id <> p_interview_id
       or v_existing.outcome is distinct from p_outcome
       or v_existing.feedback is distinct from p_feedback
       or v_existing.retake_after is distinct from p_retake_after then
      raise exception 'idempotency_key_reused' using errcode = '22023';
    end if;

    return v_existing;
  end if;

  if exists (
    select 1
    from public.interview_results
    where interview_id = p_interview_id
  ) then
    raise exception 'evaluation_exists' using errcode = '23505';
  end if;

  if v_interview.status not in ('IN_PROGRESS', 'AWAITING_OUTCOME') then
    raise exception 'invalid_interview_status' using errcode = '23514';
  end if;

  insert into public.interview_results (
    interview_id,
    outcome,
    feedback,
    evaluator_id,
    retake_after,
    idempotency_key
  )
  values (
    p_interview_id,
    p_outcome,
    p_feedback,
    auth.uid(),
    p_retake_after,
    p_idempotency_key
  )
  returning * into v_result;

  update public.interviews
  set status = 'EVALUATED',
      updated_at = now()
  where id = p_interview_id;

  if p_outcome = 'PASS' then
    insert into public.badge_awards (
      student_id,
      badge_id,
      interview_result_id,
      status
    )
    values (
      v_interview.student_id,
      v_interview.badge_id,
      v_result.id,
      'CERTIFICATION_PENDING'
    );

    insert into public.integration_outbox (
      event_type,
      aggregate_type,
      aggregate_id,
      payload
    )
    values (
      'badge.certification.requested',
      'interview_result',
      v_result.id,
      jsonb_build_object(
        'interview_id', p_interview_id,
        'result_id', v_result.id
      )
    );
  end if;

  insert into public.audit_logs (
    actor_id,
    entity_type,
    entity_id,
    action,
    new_value
  )
  values (
    auth.uid(),
    'interview_result',
    v_result.id,
    'SUBMITTED',
    to_jsonb(v_result)
  );

  return v_result;

exception
  when unique_violation then
    raise exception 'evaluation_conflict' using errcode = '23505';
end;
$$;

revoke all on function public.submit_interview_result(
  uuid, public.evaluation_outcome, text, timestamptz, text
) from public;

grant execute on function public.submit_interview_result(
  uuid, public.evaluation_outcome, text, timestamptz, text
) to authenticated;
