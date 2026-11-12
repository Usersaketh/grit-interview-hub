-- Harden booking eligibility checks while preserving all existing behavior
-- This migration replaces the book_interview function with enhanced validation

create or replace function public.book_interview(p_badge_id uuid, p_interviewer_id uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_timezone text, p_idempotency_key text)
returns public.interviews language plpgsql security definer set search_path = '' as $$
declare v_student uuid; v_existing public.interviews; v_attempt integer; v_interview public.interviews;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  -- Guard against NULL or empty idempotency key before using in advisory lock
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then raise exception 'invalid_idempotency_key' using errcode = '22023'; end if;
  -- Serializes retries for the same actor/key before the idempotency lookup.
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text || p_idempotency_key));
  select id into v_student from public.students where user_id = auth.uid(); if v_student is null then raise exception 'student_role_required' using errcode = '42501'; end if;

  -- Check profile is active
  perform 1 from public.profiles where id = auth.uid() and is_active = true;
  if not found then raise exception 'profile_inactive' using errcode = '42501'; end if;

  -- Check user has STUDENT role
  perform 1 from public.user_roles where user_id = auth.uid() and role = 'STUDENT';
  if not found then raise exception 'student_role_required' using errcode = '42501'; end if;

  -- Idempotency lookup and replay
  select i.* into v_existing from public.interviews i join public.idempotency_records r on r.actor_id=auth.uid() and r.operation='book_interview' and r.key=p_idempotency_key where (r.response->>'interview_id')::uuid=i.id;
  if found then
    -- Even for idempotent replay, ensure profile is active and has STUDENT role
    return v_existing;
  end if;

  -- Time validation
  if p_ends_at <= p_starts_at or p_starts_at <= now() then raise exception 'invalid_time_range' using errcode='22023'; end if;

  -- Interviewer active check
  perform 1 from public.interviewers where id=p_interviewer_id and is_active for key share; if not found then raise exception 'interviewer_unavailable' using errcode='23514'; end if;

  -- Availability validation
  perform 1 from public.interviewer_availability a where a.interviewer_id=p_interviewer_id and a.is_active and extract(dow from p_starts_at at time zone a.timezone)=a.day_of_week and (p_starts_at at time zone a.timezone)::time >= a.start_time and (p_ends_at at time zone a.timezone)::time <= a.end_time and (p_starts_at at time zone a.timezone)::date >= a.effective_from and (a.effective_until is null or (p_starts_at at time zone a.timezone)::date <= a.effective_until) for key share;
  if not found then raise exception 'outside_availability' using errcode='23514'; end if;

  -- Availability override conflict check
  if exists(select 1 from public.availability_overrides o where o.interviewer_id=p_interviewer_id and o.kind='UNAVAILABLE' and tstzrange(o.starts_at,o.ends_at,'[)') && tstzrange(p_starts_at,p_ends_at,'[)')) then raise exception 'availability_override_conflict' using errcode='23514'; end if;

  -- Badge existence and active check
  perform 1 from public.badges where id = p_badge_id and is_active = true;
  if not found then
    -- Check if badge exists but is inactive
    perform 1 from public.badges where id = p_badge_id;
    if found then
      raise exception 'badge_inactive' using errcode = '23514';
    else
      raise exception 'badge_not_found' using errcode = '23514';
    end if;
  end if;

  -- Badge must have at least one required skill
  perform 1 from public.badge_required_skills where badge_id = p_badge_id;
  if not found then raise exception 'not_eligible' using errcode='23514'; end if;

  -- Eligibility: every required skill must have matching student progress with verified_at not null, verified_at <= now(), achieved_level >= required_level
  if exists(
    select 1 from public.badge_required_skills r
    left join public.skill_progress sp on sp.student_id=v_student and sp.skill_id=r.skill_id
    where r.badge_id=p_badge_id
      and (sp.verified_at is null or sp.verified_at > now() or sp.achieved_level < r.required_level)
  ) then raise exception 'not_eligible' using errcode='23514'; end if;

  -- Interview creation and attempt numbering
  select coalesce(max(attempt_number),0)+1 into v_attempt from public.interviews where student_id=v_student and badge_id=p_badge_id;
  insert into public.interviews(student_id,badge_id,interviewer_id,starts_at,ends_at,timezone,attempt_number,created_by) values(v_student,p_badge_id,p_interviewer_id,p_starts_at,p_ends_at,p_timezone,v_attempt,auth.uid()) returning * into v_interview;

  -- Idempotency record creation
  insert into public.idempotency_records(actor_id,operation,key,response) values(auth.uid(),'book_interview',p_idempotency_key,jsonb_build_object('interview_id',v_interview.id));

  -- Notifications, integration outbox and audit log writes
  insert into public.notifications(user_id,type,template_key,payload) select auth.uid(),'BOOKING_CONFIRMATION','booking_confirmation',jsonb_build_object('interview_id',v_interview.id);
  insert into public.integration_outbox(event_type,aggregate_type,aggregate_id,payload) values('interview.booked','interview',v_interview.id,jsonb_build_object('interview_id',v_interview.id));
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,new_value) values(auth.uid(),'interview',v_interview.id,'BOOKED',to_jsonb(v_interview));

  return v_interview;
exception when unique_violation or exclusion_violation then raise exception 'booking_conflict' using errcode='23505'; end; $$;