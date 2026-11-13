
-- Enforce request-payload matching for booking idempotency.
-- Existing booking records are backfilled from their original interviews.
-- Other idempotency operations may continue leaving request_payload NULL.

ALTER TABLE public.idempotency_records
ADD COLUMN IF NOT EXISTS request_payload jsonb;

-- Refuse to proceed if an existing booking record cannot be backfilled.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.idempotency_records r
    LEFT JOIN public.interviews i
      ON i.id = (r.response->>'interview_id')::uuid
    WHERE r.operation = 'book_interview'
      AND i.id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot migrate booking idempotency: an existing record has no matching interview';
  END IF;
END;
$$;

-- Backfill the original booking request from the interview.
-- Epoch values make equivalent timestamps compare identically,
-- regardless of the UTC offset used in the original request.
UPDATE public.idempotency_records r
SET request_payload = jsonb_build_object(
  'badge_id', i.badge_id,
  'interviewer_id', i.interviewer_id,
  'starts_at_epoch', extract(epoch FROM i.starts_at)::numeric,
  'ends_at_epoch', extract(epoch FROM i.ends_at)::numeric,
  'timezone', i.timezone
)
FROM public.interviews i
WHERE r.operation = 'book_interview'
  AND i.id = (r.response->>'interview_id')::uuid;

CREATE OR REPLACE FUNCTION public.book_interview(
  p_badge_id uuid,
  p_interviewer_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text,
  p_idempotency_key text
)
RETURNS public.interviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_student uuid;
  v_existing public.interviews;
  v_existing_payload jsonb;
  v_existing_interview_id uuid;
  v_request_payload jsonb;
  v_attempt integer;
  v_interview public.interviews;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated'
      USING errcode = '28000';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'invalid_idempotency_key'
      USING errcode = '22023';
  END IF;

  -- Serialize requests using the same actor and idempotency key.
  PERFORM pg_advisory_xact_lock(
    hashtext(auth.uid()::text || p_idempotency_key)
  );

  SELECT id
  INTO v_student
  FROM public.students
  WHERE user_id = auth.uid();

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'student_role_required'
      USING errcode = '42501';
  END IF;

  PERFORM 1
  FROM public.profiles
  WHERE id = auth.uid()
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_inactive'
      USING errcode = '42501';
  END IF;

  PERFORM 1
  FROM public.user_roles
  WHERE user_id = auth.uid()
    AND role = 'STUDENT';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'student_role_required'
      USING errcode = '42501';
  END IF;

  -- Canonical request payload.
  v_request_payload := jsonb_build_object(
    'badge_id', p_badge_id,
    'interviewer_id', p_interviewer_id,
    'starts_at_epoch', extract(epoch FROM p_starts_at)::numeric,
    'ends_at_epoch', extract(epoch FROM p_ends_at)::numeric,
    'timezone', p_timezone
  );

  -- Look up the idempotency record independently of the interview.
  SELECT
    r.request_payload,
    (r.response->>'interview_id')::uuid
  INTO
    v_existing_payload,
    v_existing_interview_id
  FROM public.idempotency_records r
  WHERE r.actor_id = auth.uid()
    AND r.operation = 'book_interview'
    AND r.key = p_idempotency_key;

  IF FOUND THEN
    -- Never replay a previous booking for a different request.
    IF v_existing_payload IS DISTINCT FROM v_request_payload THEN
      RAISE EXCEPTION 'idempotency_key_reused'
        USING errcode = 'P0001';
    END IF;

    SELECT *
    INTO v_existing
    FROM public.interviews
    WHERE id = v_existing_interview_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'idempotency_record_corrupt'
        USING errcode = 'P0001';
    END IF;

    RETURN v_existing;
  END IF;

  -- Time validation.
  IF p_ends_at <= p_starts_at OR p_starts_at <= now() THEN
    RAISE EXCEPTION 'invalid_time_range'
      USING errcode = '22023';
  END IF;

  -- Interviewer active check.
  PERFORM 1
  FROM public.interviewers
  WHERE id = p_interviewer_id
    AND is_active
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'interviewer_unavailable'
      USING errcode = '23514';
  END IF;

  -- Availability validation.
  PERFORM 1
  FROM public.interviewer_availability a
  WHERE a.interviewer_id = p_interviewer_id
    AND a.is_active
    AND extract(dow FROM p_starts_at AT TIME ZONE a.timezone) = a.day_of_week
    AND (p_starts_at AT TIME ZONE a.timezone)::time >= a.start_time
    AND (p_ends_at AT TIME ZONE a.timezone)::time <= a.end_time
    AND (p_starts_at AT TIME ZONE a.timezone)::date >= a.effective_from
    AND (
      a.effective_until IS NULL
      OR (p_starts_at AT TIME ZONE a.timezone)::date <= a.effective_until
    )
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'outside_availability'
      USING errcode = '23514';
  END IF;

  -- Availability override conflict check.
  IF EXISTS (
    SELECT 1
    FROM public.availability_overrides o
    WHERE o.interviewer_id = p_interviewer_id
      AND o.kind = 'UNAVAILABLE'
      AND tstzrange(o.starts_at, o.ends_at, '[)')
          && tstzrange(p_starts_at, p_ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'availability_override_conflict'
      USING errcode = '23514';
  END IF;

  -- Badge existence and active check.
  PERFORM 1
  FROM public.badges
  WHERE id = p_badge_id
    AND is_active = true;

  IF NOT FOUND THEN
    PERFORM 1
    FROM public.badges
    WHERE id = p_badge_id;

    IF FOUND THEN
      RAISE EXCEPTION 'badge_inactive'
        USING errcode = '23514';
    ELSE
      RAISE EXCEPTION 'badge_not_found'
        USING errcode = '23514';
    END IF;
  END IF;

  -- Badge must have at least one required skill.
  PERFORM 1
  FROM public.badge_required_skills
  WHERE badge_id = p_badge_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_eligible'
      USING errcode = '23514';
  END IF;

  -- Every required skill must be verified and meet its required level.
  IF EXISTS (
    SELECT 1
    FROM public.badge_required_skills r
    LEFT JOIN public.skill_progress sp
      ON sp.student_id = v_student
      AND sp.skill_id = r.skill_id
    WHERE r.badge_id = p_badge_id
      AND (
        sp.verified_at IS NULL
        OR sp.verified_at > now()
        OR sp.achieved_level < r.required_level
      )
  ) THEN
    RAISE EXCEPTION 'not_eligible'
      USING errcode = '23514';
  END IF;

  -- Calculate attempt number.
  SELECT coalesce(max(attempt_number), 0) + 1
  INTO v_attempt
  FROM public.interviews
  WHERE student_id = v_student
    AND badge_id = p_badge_id;

  -- Create interview.
  INSERT INTO public.interviews (
    student_id,
    badge_id,
    interviewer_id,
    starts_at,
    ends_at,
    timezone,
    attempt_number,
    created_by
  )
  VALUES (
    v_student,
    p_badge_id,
    p_interviewer_id,
    p_starts_at,
    p_ends_at,
    p_timezone,
    v_attempt,
    auth.uid()
  )
  RETURNING * INTO v_interview;

  -- Persist both the original request and its result.
  INSERT INTO public.idempotency_records (
    actor_id,
    operation,
    key,
    response,
    request_payload
  )
  VALUES (
    auth.uid(),
    'book_interview',
    p_idempotency_key,
    jsonb_build_object('interview_id', v_interview.id),
    v_request_payload
  );

  -- Notifications.
  INSERT INTO public.notifications (
    user_id,
    type,
    template_key,
    payload
  )
  VALUES (
    auth.uid(),
    'BOOKING_CONFIRMATION',
    'booking_confirmation',
    jsonb_build_object('interview_id', v_interview.id)
  );

  -- Integration outbox.
  INSERT INTO public.integration_outbox (
    event_type,
    aggregate_type,
    aggregate_id,
    payload
  )
  VALUES (
    'interview.booked',
    'interview',
    v_interview.id,
    jsonb_build_object('interview_id', v_interview.id)
  );

  -- Audit log.
  INSERT INTO public.audit_logs (
    actor_id,
    entity_type,
    entity_id,
    action,
    new_value
  )
  VALUES (
    auth.uid(),
    'interview',
    v_interview.id,
    'BOOKED',
    to_jsonb(v_interview)
  );

  RETURN v_interview;

EXCEPTION
  WHEN unique_violation OR exclusion_violation THEN
    RAISE EXCEPTION 'booking_conflict'
      USING errcode = '23505';
END;
$function$;
