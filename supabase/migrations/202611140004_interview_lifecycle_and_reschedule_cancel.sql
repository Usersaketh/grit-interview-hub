-- Complete interview lifecycle (start, complete/awaiting-outcome, attendance),
-- transactional student cancellation, and atomic student rescheduling.
-- Additive migration: preserves all existing constraints, adds security-definer RPCs.

-- 1. Enforce retake_after cooldown in book_interview while keeping existing error semantics.
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
  v_retake_after timestamptz;
  v_attempt integer;
  v_interview public.interviews;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING errcode = '28000';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING errcode = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(auth.uid()::text || p_idempotency_key));

  SELECT id INTO v_student
  FROM public.students
  WHERE user_id = auth.uid();

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'student_role_required' USING errcode = '42501';
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = auth.uid() AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_inactive' USING errcode = '42501';
  END IF;

  PERFORM 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'STUDENT';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'student_role_required' USING errcode = '42501';
  END IF;

  v_request_payload := jsonb_build_object(
    'badge_id', p_badge_id,
    'interviewer_id', p_interviewer_id,
    'starts_at_epoch', extract(epoch FROM p_starts_at)::numeric,
    'ends_at_epoch', extract(epoch FROM p_ends_at)::numeric,
    'timezone', p_timezone
  );

  SELECT r.request_payload, (r.response->>'interview_id')::uuid
  INTO v_existing_payload, v_existing_interview_id
  FROM public.idempotency_records r
  WHERE r.actor_id = auth.uid()
    AND r.operation = 'book_interview'
    AND r.key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_payload IS DISTINCT FROM v_request_payload THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING errcode = 'P0001';
    END IF;

    SELECT * INTO v_existing
    FROM public.interviews
    WHERE id = v_existing_interview_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'idempotency_record_corrupt' USING errcode = 'P0001';
    END IF;

    RETURN v_existing;
  END IF;

  IF p_ends_at <= p_starts_at OR p_starts_at <= now() THEN
    RAISE EXCEPTION 'invalid_time_range' USING errcode = '22023';
  END IF;

  PERFORM 1
  FROM public.interviewers
  WHERE id = p_interviewer_id
    AND is_active
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'interviewer_unavailable' USING errcode = '23514';
  END IF;

  -- Check recurring availability OR explicit AVAILABLE override window.
  IF NOT EXISTS (
    SELECT 1
    FROM public.interviewer_availability a
    WHERE a.interviewer_id = p_interviewer_id
      AND a.is_active
      AND extract(dow FROM p_starts_at AT TIME ZONE a.timezone) = a.day_of_week
      AND (p_starts_at AT TIME ZONE a.timezone)::time >= a.start_time
      AND (p_ends_at AT TIME ZONE a.timezone)::time <= a.end_time
      AND (p_starts_at AT TIME ZONE a.timezone)::date >= a.effective_from
      AND (a.effective_until IS NULL OR (p_starts_at AT TIME ZONE a.timezone)::date <= a.effective_until)
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.availability_overrides o
    WHERE o.interviewer_id = p_interviewer_id
      AND o.kind = 'AVAILABLE'
      AND o.starts_at <= p_starts_at
      AND o.ends_at >= p_ends_at
  ) THEN
    RAISE EXCEPTION 'outside_availability' USING errcode = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.availability_overrides o
    WHERE o.interviewer_id = p_interviewer_id
      AND o.kind = 'UNAVAILABLE'
      AND tstzrange(o.starts_at, o.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'availability_override_conflict' USING errcode = '23514';
  END IF;

  PERFORM 1 FROM public.badges WHERE id = p_badge_id AND is_active = true;
  IF NOT FOUND THEN
    PERFORM 1 FROM public.badges WHERE id = p_badge_id;
    IF FOUND THEN
      RAISE EXCEPTION 'badge_inactive' USING errcode = '23514';
    ELSE
      RAISE EXCEPTION 'badge_not_found' USING errcode = '23514';
    END IF;
  END IF;

  PERFORM 1 FROM public.badge_required_skills WHERE badge_id = p_badge_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_eligible' USING errcode = '23514';
  END IF;

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
    RAISE EXCEPTION 'not_eligible' USING errcode = '23514';
  END IF;

  -- Enforce RETAKE_LATER waiting period if latest result for this badge specified retake_after.
  SELECT ir.retake_after
  INTO v_retake_after
  FROM public.interviews iv
  JOIN public.interview_results ir ON ir.interview_id = iv.id
  WHERE iv.student_id = v_student
    AND iv.badge_id = p_badge_id
    AND ir.outcome = 'RETAKE_LATER'
    AND ir.retake_after IS NOT NULL
  ORDER BY ir.submitted_at DESC
  LIMIT 1;

  IF v_retake_after IS NOT NULL AND p_starts_at < v_retake_after THEN
    RAISE EXCEPTION 'retake_cooldown_active' USING errcode = '23514';
  END IF;

  SELECT coalesce(max(attempt_number), 0) + 1
  INTO v_attempt
  FROM public.interviews
  WHERE student_id = v_student
    AND badge_id = p_badge_id;

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

  INSERT INTO public.idempotency_records (actor_id, operation, key, response, request_payload)
  VALUES (
    auth.uid(),
    'book_interview',
    p_idempotency_key,
    jsonb_build_object('interview_id', v_interview.id),
    v_request_payload
  );

  INSERT INTO public.notifications (user_id, type, template_key, payload)
  VALUES (
    auth.uid(),
    'BOOKING_CONFIRMATION',
    'booking_confirmation',
    jsonb_build_object('interview_id', v_interview.id)
  );

  INSERT INTO public.integration_outbox (event_type, aggregate_type, aggregate_id, payload)
  VALUES (
    'interview.booked',
    'interview',
    v_interview.id,
    jsonb_build_object('interview_id', v_interview.id)
  );

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, new_value)
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
    RAISE EXCEPTION 'booking_conflict' USING errcode = '23505';
END;
$function$;

-- 2. Interview lifecycle transitions: Start Interview (BOOKED -> IN_PROGRESS).
CREATE OR REPLACE FUNCTION public.start_interview(
  p_interview_id uuid,
  p_idempotency_key text,
  p_student_attendance public.attendance_status DEFAULT 'ATTENDED',
  p_interviewer_attendance public.attendance_status DEFAULT 'ATTENDED',
  p_notes text DEFAULT NULL
)
RETURNS public.interviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_interviewer_id uuid;
  v_is_staff boolean;
  v_existing_idem public.idempotency_records;
  v_request_payload jsonb;
  v_interview public.interviews;
  v_before public.interviews;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING errcode = '28000';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING errcode = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'profile_inactive' USING errcode = '42501';
  END IF;

  v_is_staff := public.is_staff();
  SELECT id INTO v_interviewer_id
  FROM public.interviewers
  WHERE user_id = auth.uid() AND is_active = true;

  IF NOT v_is_staff AND v_interviewer_id IS NULL THEN
    RAISE EXCEPTION 'interviewer_role_required' USING errcode = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(auth.uid()::text || ':start_interview:' || p_idempotency_key));

  v_request_payload := jsonb_build_object(
    'interview_id', p_interview_id,
    'student_attendance', p_student_attendance,
    'interviewer_attendance', p_interviewer_attendance,
    'notes', nullif(btrim(coalesce(p_notes, '')), '')
  );

  SELECT * INTO v_existing_idem
  FROM public.idempotency_records
  WHERE actor_id = auth.uid()
    AND operation = 'start_interview'
    AND key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_idem.request_payload IS DISTINCT FROM v_request_payload THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING errcode = 'P0001';
    END IF;
    SELECT * INTO v_interview FROM public.interviews WHERE id = (v_existing_idem.response->>'interview_id')::uuid;
    RETURN v_interview;
  END IF;

  SELECT * INTO v_interview
  FROM public.interviews
  WHERE id = p_interview_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'interview_not_found' USING errcode = 'P0002';
  END IF;

  IF NOT v_is_staff AND v_interview.interviewer_id <> v_interviewer_id THEN
    RAISE EXCEPTION 'not_assigned_interviewer' USING errcode = '42501';
  END IF;

  IF v_interview.status <> 'BOOKED' THEN
    RAISE EXCEPTION 'invalid_interview_status' USING errcode = '23514';
  END IF;

  v_before := v_interview;

  UPDATE public.interviews
  SET status = 'IN_PROGRESS',
      updated_at = now()
  WHERE id = p_interview_id
  RETURNING * INTO v_interview;

  INSERT INTO public.interview_attendance (
    interview_id,
    student_attendance,
    interviewer_attendance,
    marked_by,
    marked_at,
    notes
  )
  VALUES (
    p_interview_id,
    coalesce(p_student_attendance, 'ATTENDED'),
    coalesce(p_interviewer_attendance, 'ATTENDED'),
    auth.uid(),
    now(),
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  ON CONFLICT (interview_id) DO UPDATE
    SET student_attendance = excluded.student_attendance,
        interviewer_attendance = excluded.interviewer_attendance,
        marked_by = auth.uid(),
        marked_at = now(),
        notes = coalesce(excluded.notes, public.interview_attendance.notes);

  INSERT INTO public.idempotency_records (actor_id, operation, key, response, request_payload)
  VALUES (
    auth.uid(),
    'start_interview',
    p_idempotency_key,
    jsonb_build_object('interview_id', v_interview.id),
    v_request_payload
  );

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, previous_value, new_value, reason)
  VALUES (
    auth.uid(),
    'interview',
    v_interview.id,
    'STARTED',
    to_jsonb(v_before),
    to_jsonb(v_interview),
    'Interview session started'
  );

  INSERT INTO public.integration_outbox (event_type, aggregate_type, aggregate_id, payload)
  VALUES (
    'interview.started',
    'interview',
    v_interview.id,
    jsonb_build_object('interview_id', v_interview.id)
  );

  RETURN v_interview;
END;
$$;

-- 3. Interview lifecycle: Complete live session (IN_PROGRESS -> AWAITING_OUTCOME).
CREATE OR REPLACE FUNCTION public.complete_interview_session(
  p_interview_id uuid,
  p_idempotency_key text,
  p_student_attendance public.attendance_status DEFAULT NULL,
  p_interviewer_attendance public.attendance_status DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.interviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_interviewer_id uuid;
  v_is_staff boolean;
  v_existing_idem public.idempotency_records;
  v_request_payload jsonb;
  v_interview public.interviews;
  v_before public.interviews;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING errcode = '28000';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING errcode = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'profile_inactive' USING errcode = '42501';
  END IF;

  v_is_staff := public.is_staff();
  SELECT id INTO v_interviewer_id
  FROM public.interviewers
  WHERE user_id = auth.uid() AND is_active = true;

  IF NOT v_is_staff AND v_interviewer_id IS NULL THEN
    RAISE EXCEPTION 'interviewer_role_required' USING errcode = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(auth.uid()::text || ':complete_session:' || p_idempotency_key));

  v_request_payload := jsonb_build_object(
    'interview_id', p_interview_id,
    'student_attendance', p_student_attendance,
    'interviewer_attendance', p_interviewer_attendance,
    'notes', nullif(btrim(coalesce(p_notes, '')), '')
  );

  SELECT * INTO v_existing_idem
  FROM public.idempotency_records
  WHERE actor_id = auth.uid()
    AND operation = 'complete_interview_session'
    AND key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_idem.request_payload IS DISTINCT FROM v_request_payload THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING errcode = 'P0001';
    END IF;
    SELECT * INTO v_interview FROM public.interviews WHERE id = (v_existing_idem.response->>'interview_id')::uuid;
    RETURN v_interview;
  END IF;

  SELECT * INTO v_interview
  FROM public.interviews
  WHERE id = p_interview_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'interview_not_found' USING errcode = 'P0002';
  END IF;

  IF NOT v_is_staff AND v_interview.interviewer_id <> v_interviewer_id THEN
    RAISE EXCEPTION 'not_assigned_interviewer' USING errcode = '42501';
  END IF;

  IF v_interview.status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'invalid_interview_status' USING errcode = '23514';
  END IF;

  v_before := v_interview;

  UPDATE public.interviews
  SET status = 'AWAITING_OUTCOME',
      updated_at = now()
  WHERE id = p_interview_id
  RETURNING * INTO v_interview;

  IF p_student_attendance IS NOT NULL OR p_interviewer_attendance IS NOT NULL OR p_notes IS NOT NULL THEN
    INSERT INTO public.interview_attendance (
      interview_id,
      student_attendance,
      interviewer_attendance,
      marked_by,
      marked_at,
      notes
    )
    VALUES (
      p_interview_id,
      coalesce(p_student_attendance, 'ATTENDED'),
      coalesce(p_interviewer_attendance, 'ATTENDED'),
      auth.uid(),
      now(),
      nullif(btrim(coalesce(p_notes, '')), '')
    )
    ON CONFLICT (interview_id) DO UPDATE
      SET student_attendance = coalesce(p_student_attendance, public.interview_attendance.student_attendance),
          interviewer_attendance = coalesce(p_interviewer_attendance, public.interview_attendance.interviewer_attendance),
          marked_by = auth.uid(),
          marked_at = now(),
          notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), public.interview_attendance.notes);
  END IF;

  INSERT INTO public.idempotency_records (actor_id, operation, key, response, request_payload)
  VALUES (
    auth.uid(),
    'complete_interview_session',
    p_idempotency_key,
    jsonb_build_object('interview_id', v_interview.id),
    v_request_payload
  );

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, previous_value, new_value, reason)
  VALUES (
    auth.uid(),
    'interview',
    v_interview.id,
    'AWAITING_OUTCOME',
    to_jsonb(v_before),
    to_jsonb(v_interview),
    'Live session ended; awaiting outcome'
  );

  INSERT INTO public.integration_outbox (event_type, aggregate_type, aggregate_id, payload)
  VALUES (
    'interview.awaiting_outcome',
    'interview',
    v_interview.id,
    jsonb_build_object('interview_id', v_interview.id)
  );

  RETURN v_interview;
END;
$$;

-- 4. Record attendance & optional NO_SHOW marking (separate from FAIL outcome per PRD).
CREATE OR REPLACE FUNCTION public.record_interview_attendance(
  p_interview_id uuid,
  p_student_attendance public.attendance_status,
  p_interviewer_attendance public.attendance_status,
  p_notes text,
  p_mark_no_show boolean,
  p_idempotency_key text
)
RETURNS public.interviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_interviewer_id uuid;
  v_is_staff boolean;
  v_existing_idem public.idempotency_records;
  v_request_payload jsonb;
  v_interview public.interviews;
  v_before public.interviews;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING errcode = '28000';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING errcode = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'profile_inactive' USING errcode = '42501';
  END IF;

  v_is_staff := public.is_staff();
  SELECT id INTO v_interviewer_id
  FROM public.interviewers
  WHERE user_id = auth.uid() AND is_active = true;

  IF NOT v_is_staff AND v_interviewer_id IS NULL THEN
    RAISE EXCEPTION 'interviewer_role_required' USING errcode = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(auth.uid()::text || ':attendance:' || p_idempotency_key));

  v_request_payload := jsonb_build_object(
    'interview_id', p_interview_id,
    'student_attendance', p_student_attendance,
    'interviewer_attendance', p_interviewer_attendance,
    'notes', nullif(btrim(coalesce(p_notes, '')), ''),
    'mark_no_show', coalesce(p_mark_no_show, false)
  );

  SELECT * INTO v_existing_idem
  FROM public.idempotency_records
  WHERE actor_id = auth.uid()
    AND operation = 'record_interview_attendance'
    AND key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_idem.request_payload IS DISTINCT FROM v_request_payload THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING errcode = 'P0001';
    END IF;
    SELECT * INTO v_interview FROM public.interviews WHERE id = (v_existing_idem.response->>'interview_id')::uuid;
    RETURN v_interview;
  END IF;

  SELECT * INTO v_interview
  FROM public.interviews
  WHERE id = p_interview_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'interview_not_found' USING errcode = 'P0002';
  END IF;

  IF NOT v_is_staff AND v_interview.interviewer_id <> v_interviewer_id THEN
    RAISE EXCEPTION 'not_assigned_interviewer' USING errcode = '42501';
  END IF;

  IF v_interview.status IN ('CANCELLED', 'INTERVIEWER_CANCELLED', 'EVALUATED') THEN
    RAISE EXCEPTION 'invalid_interview_status' USING errcode = '23514';
  END IF;

  v_before := v_interview;

  INSERT INTO public.interview_attendance (
    interview_id,
    student_attendance,
    interviewer_attendance,
    marked_by,
    marked_at,
    notes
  )
  VALUES (
    p_interview_id,
    p_student_attendance,
    p_interviewer_attendance,
    auth.uid(),
    now(),
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  ON CONFLICT (interview_id) DO UPDATE
    SET student_attendance = excluded.student_attendance,
        interviewer_attendance = excluded.interviewer_attendance,
        marked_by = auth.uid(),
        marked_at = now(),
        notes = excluded.notes;

  IF coalesce(p_mark_no_show, false) THEN
    IF v_interview.status NOT IN ('BOOKED', 'IN_PROGRESS') THEN
      RAISE EXCEPTION 'invalid_interview_status' USING errcode = '23514';
    END IF;

    UPDATE public.interviews
    SET status = 'NO_SHOW',
        updated_at = now()
    WHERE id = p_interview_id
    RETURNING * INTO v_interview;

    INSERT INTO public.integration_outbox (event_type, aggregate_type, aggregate_id, payload)
    VALUES (
      'interview.no_show',
      'interview',
      v_interview.id,
      jsonb_build_object('interview_id', v_interview.id, 'student_attendance', p_student_attendance)
    );
  END IF;

  INSERT INTO public.idempotency_records (actor_id, operation, key, response, request_payload)
  VALUES (
    auth.uid(),
    'record_interview_attendance',
    p_idempotency_key,
    jsonb_build_object('interview_id', v_interview.id),
    v_request_payload
  );

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, previous_value, new_value, reason)
  VALUES (
    auth.uid(),
    'interview',
    v_interview.id,
    CASE WHEN coalesce(p_mark_no_show, false) THEN 'NO_SHOW' ELSE 'ATTENDANCE_RECORDED' END,
    to_jsonb(v_before),
    to_jsonb(v_interview),
    coalesce(nullif(btrim(coalesce(p_notes, '')), ''), 'Attendance recorded: ' || p_student_attendance::text)
  );

  RETURN v_interview;
END;
$$;

-- 5. Safe interviewer/staff session detail helper (exposes student display name & external ID to assigned interviewer).
CREATE OR REPLACE FUNCTION public.get_interview_workspace_detail(
  p_interview_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_interview public.interviews;
  v_interviewer_id uuid;
  v_student_id uuid;
  v_is_staff boolean;
  v_student_name text;
  v_external_student_id text;
  v_campus_ref text;
  v_interviewer_name text;
  v_interviewer_title text;
  v_badge jsonb;
  v_attendance jsonb;
  v_result jsonb;
  v_reschedules jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING errcode = '28000';
  END IF;

  v_is_staff := public.is_staff();
  SELECT id INTO v_interviewer_id FROM public.interviewers WHERE user_id = auth.uid();
  SELECT id INTO v_student_id FROM public.students WHERE user_id = auth.uid();

  SELECT * INTO v_interview FROM public.interviews WHERE id = p_interview_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'interview_not_found' USING errcode = 'P0002';
  END IF;

  IF NOT v_is_staff
     AND (v_interviewer_id IS NULL OR v_interview.interviewer_id <> v_interviewer_id)
     AND (v_student_id IS NULL OR v_interview.student_id <> v_student_id) THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  SELECT sp.full_name, s.external_student_id, s.campus_ref
  INTO v_student_name, v_external_student_id, v_campus_ref
  FROM public.students s
  JOIN public.profiles sp ON sp.id = s.user_id
  WHERE s.id = v_interview.student_id;

  SELECT ip.full_name, coalesce(iv.title, 'Certified Badge Interviewer')
  INTO v_interviewer_name, v_interviewer_title
  FROM public.interviewers iv
  JOIN public.profiles ip ON ip.id = iv.user_id
  WHERE iv.id = v_interview.interviewer_id;

  SELECT jsonb_build_object('id', b.id, 'name', b.name, 'level', b.level, 'track_name', t.name)
  INTO v_badge
  FROM public.badges b
  JOIN public.tracks t ON t.id = b.track_id
  WHERE b.id = v_interview.badge_id;

  SELECT to_jsonb(ia) INTO v_attendance
  FROM public.interview_attendance ia
  WHERE ia.interview_id = p_interview_id;

  SELECT to_jsonb(ir) INTO v_result
  FROM public.interview_results ir
  WHERE ir.interview_id = p_interview_id;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', rh.id,
        'old_starts_at', rh.old_starts_at,
        'old_ends_at', rh.old_ends_at,
        'new_starts_at', rh.new_starts_at,
        'new_ends_at', rh.new_ends_at,
        'reason', rh.reason,
        'created_at', rh.created_at
      )
      ORDER BY rh.created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_reschedules
  FROM public.interview_reschedule_history rh
  WHERE rh.interview_id = p_interview_id;

  RETURN jsonb_build_object(
    'interview', to_jsonb(v_interview),
    'badge', v_badge,
    'student', jsonb_build_object(
      'id', v_interview.student_id,
      'full_name', v_student_name,
      'external_student_id', v_external_student_id,
      'campus_ref', v_campus_ref
    ),
    'interviewer', jsonb_build_object(
      'id', v_interview.interviewer_id,
      'display_name', v_interviewer_name,
      'title', v_interviewer_title
    ),
    'attendance', v_attendance,
    'result', v_result,
    'reschedule_history', v_reschedules
  );
END;
$$;

-- 6. Student transactional booking cancellation (2-hour notice cutoff, idempotent, audited).
CREATE OR REPLACE FUNCTION public.cancel_student_booking(
  p_interview_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS public.interviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_student uuid;
  v_existing_idem public.idempotency_records;
  v_request_payload jsonb;
  v_interview public.interviews;
  v_before public.interviews;
  v_clean_reason text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING errcode = '28000';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING errcode = '22023';
  END IF;

  v_clean_reason := btrim(coalesce(p_reason, ''));
  IF v_clean_reason = '' THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'profile_inactive' USING errcode = '42501';
  END IF;

  IF NOT public.has_role('STUDENT') THEN
    RAISE EXCEPTION 'student_role_required' USING errcode = '42501';
  END IF;

  SELECT id INTO v_student FROM public.students WHERE user_id = auth.uid();
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'student_role_required' USING errcode = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(auth.uid()::text || ':cancel_booking:' || p_idempotency_key));

  v_request_payload := jsonb_build_object(
    'interview_id', p_interview_id,
    'reason', v_clean_reason
  );

  SELECT * INTO v_existing_idem
  FROM public.idempotency_records
  WHERE actor_id = auth.uid()
    AND operation = 'cancel_student_booking'
    AND key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_idem.request_payload IS DISTINCT FROM v_request_payload THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING errcode = 'P0001';
    END IF;
    SELECT * INTO v_interview FROM public.interviews WHERE id = (v_existing_idem.response->>'interview_id')::uuid;
    RETURN v_interview;
  END IF;

  SELECT * INTO v_interview
  FROM public.interviews
  WHERE id = p_interview_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'interview_not_found' USING errcode = 'P0002';
  END IF;

  IF v_interview.student_id <> v_student THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  IF v_interview.status NOT IN ('BOOKED', 'RESCHEDULE_PENDING') THEN
    RAISE EXCEPTION 'invalid_interview_status' USING errcode = '23514';
  END IF;

  IF v_interview.starts_at - now() < interval '2 hours' THEN
    RAISE EXCEPTION 'cancellation_cutoff_passed' USING errcode = '23514';
  END IF;

  v_before := v_interview;

  UPDATE public.interviews
  SET status = 'CANCELLED',
      cancelled_at = now(),
      cancellation_reason = v_clean_reason,
      updated_at = now()
  WHERE id = p_interview_id
  RETURNING * INTO v_interview;

  INSERT INTO public.idempotency_records (actor_id, operation, key, response, request_payload)
  VALUES (
    auth.uid(),
    'cancel_student_booking',
    p_idempotency_key,
    jsonb_build_object('interview_id', v_interview.id),
    v_request_payload
  );

  INSERT INTO public.notifications (user_id, type, template_key, payload)
  VALUES (
    auth.uid(),
    'BOOKING_CANCELLED',
    'booking_cancelled',
    jsonb_build_object('interview_id', v_interview.id, 'reason', v_clean_reason)
  );

  INSERT INTO public.integration_outbox (event_type, aggregate_type, aggregate_id, payload)
  VALUES (
    'interview.cancelled',
    'interview',
    v_interview.id,
    jsonb_build_object('interview_id', v_interview.id, 'reason', v_clean_reason)
  );

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, previous_value, new_value, reason)
  VALUES (
    auth.uid(),
    'interview',
    v_interview.id,
    'CANCELLED',
    to_jsonb(v_before),
    to_jsonb(v_interview),
    v_clean_reason
  );

  RETURN v_interview;
END;
$$;

-- 7. Student transactional atomic rescheduling (in-place update protected by GiST exclusion).
CREATE OR REPLACE FUNCTION public.reschedule_student_booking(
  p_interview_id uuid,
  p_new_interviewer_id uuid,
  p_new_starts_at timestamptz,
  p_new_ends_at timestamptz,
  p_timezone text,
  p_reason text,
  p_idempotency_key text
)
RETURNS public.interviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_student uuid;
  v_existing_idem public.idempotency_records;
  v_request_payload jsonb;
  v_interview public.interviews;
  v_before public.interviews;
  v_clean_reason text;
  v_retake_after timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING errcode = '28000';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING errcode = '22023';
  END IF;

  v_clean_reason := btrim(coalesce(p_reason, ''));
  IF v_clean_reason = '' THEN
    RAISE EXCEPTION 'reason_required' USING errcode = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active = true) THEN
    RAISE EXCEPTION 'profile_inactive' USING errcode = '42501';
  END IF;

  IF NOT public.has_role('STUDENT') THEN
    RAISE EXCEPTION 'student_role_required' USING errcode = '42501';
  END IF;

  SELECT id INTO v_student FROM public.students WHERE user_id = auth.uid();
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'student_role_required' USING errcode = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(auth.uid()::text || ':reschedule_booking:' || p_idempotency_key));

  v_request_payload := jsonb_build_object(
    'interview_id', p_interview_id,
    'new_interviewer_id', p_new_interviewer_id,
    'starts_at_epoch', extract(epoch FROM p_new_starts_at)::numeric,
    'ends_at_epoch', extract(epoch FROM p_new_ends_at)::numeric,
    'timezone', p_timezone,
    'reason', v_clean_reason
  );

  SELECT * INTO v_existing_idem
  FROM public.idempotency_records
  WHERE actor_id = auth.uid()
    AND operation = 'reschedule_student_booking'
    AND key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_idem.request_payload IS DISTINCT FROM v_request_payload THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING errcode = 'P0001';
    END IF;
    SELECT * INTO v_interview FROM public.interviews WHERE id = (v_existing_idem.response->>'interview_id')::uuid;
    RETURN v_interview;
  END IF;

  SELECT * INTO v_interview
  FROM public.interviews
  WHERE id = p_interview_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'interview_not_found' USING errcode = 'P0002';
  END IF;

  IF v_interview.student_id <> v_student THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  IF v_interview.status NOT IN ('BOOKED', 'RESCHEDULE_PENDING') THEN
    RAISE EXCEPTION 'invalid_interview_status' USING errcode = '23514';
  END IF;

  IF v_interview.starts_at - now() < interval '2 hours' THEN
    RAISE EXCEPTION 'reschedule_cutoff_passed' USING errcode = '23514';
  END IF;

  IF p_new_ends_at <= p_new_starts_at OR p_new_starts_at <= now() THEN
    RAISE EXCEPTION 'invalid_time_range' USING errcode = '22023';
  END IF;

  PERFORM 1
  FROM public.interviewers
  WHERE id = p_new_interviewer_id
    AND is_active
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'interviewer_unavailable' USING errcode = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.interviewer_availability a
    WHERE a.interviewer_id = p_new_interviewer_id
      AND a.is_active
      AND extract(dow FROM p_new_starts_at AT TIME ZONE a.timezone) = a.day_of_week
      AND (p_new_starts_at AT TIME ZONE a.timezone)::time >= a.start_time
      AND (p_new_ends_at AT TIME ZONE a.timezone)::time <= a.end_time
      AND (p_new_starts_at AT TIME ZONE a.timezone)::date >= a.effective_from
      AND (a.effective_until IS NULL OR (p_new_starts_at AT TIME ZONE a.timezone)::date <= a.effective_until)
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.availability_overrides o
    WHERE o.interviewer_id = p_new_interviewer_id
      AND o.kind = 'AVAILABLE'
      AND o.starts_at <= p_new_starts_at
      AND o.ends_at >= p_new_ends_at
  ) THEN
    RAISE EXCEPTION 'outside_availability' USING errcode = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.availability_overrides o
    WHERE o.interviewer_id = p_new_interviewer_id
      AND o.kind = 'UNAVAILABLE'
      AND tstzrange(o.starts_at, o.ends_at, '[)') && tstzrange(p_new_starts_at, p_new_ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'availability_override_conflict' USING errcode = '23514';
  END IF;

  -- Revalidate student eligibility for the badge before rescheduling.
  PERFORM 1 FROM public.badges WHERE id = v_interview.badge_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'badge_inactive' USING errcode = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.badge_required_skills r
    LEFT JOIN public.skill_progress sp
      ON sp.student_id = v_student
      AND sp.skill_id = r.skill_id
    WHERE r.badge_id = v_interview.badge_id
      AND (
        sp.verified_at IS NULL
        OR sp.verified_at > now()
        OR sp.achieved_level < r.required_level
      )
  ) THEN
    RAISE EXCEPTION 'not_eligible' USING errcode = '23514';
  END IF;

  SELECT ir.retake_after INTO v_retake_after
  FROM public.interviews iv
  JOIN public.interview_results ir ON ir.interview_id = iv.id
  WHERE iv.student_id = v_student
    AND iv.badge_id = v_interview.badge_id
    AND ir.outcome = 'RETAKE_LATER'
    AND ir.retake_after IS NOT NULL
  ORDER BY ir.submitted_at DESC
  LIMIT 1;

  IF v_retake_after IS NOT NULL AND p_new_starts_at < v_retake_after THEN
    RAISE EXCEPTION 'retake_cooldown_active' USING errcode = '23514';
  END IF;

  v_before := v_interview;

  -- In-place update triggers PostgreSQL GiST exclusion constraint interviews_no_interviewer_overlap.
  UPDATE public.interviews
  SET interviewer_id = p_new_interviewer_id,
      starts_at = p_new_starts_at,
      ends_at = p_new_ends_at,
      timezone = p_timezone,
      status = 'BOOKED',
      updated_at = now()
  WHERE id = p_interview_id
  RETURNING * INTO v_interview;

  INSERT INTO public.interview_reschedule_history (
    interview_id,
    old_starts_at,
    old_ends_at,
    new_starts_at,
    new_ends_at,
    requested_by,
    reason
  )
  VALUES (
    p_interview_id,
    v_before.starts_at,
    v_before.ends_at,
    p_new_starts_at,
    p_new_ends_at,
    auth.uid(),
    v_clean_reason
  );

  INSERT INTO public.idempotency_records (actor_id, operation, key, response, request_payload)
  VALUES (
    auth.uid(),
    'reschedule_student_booking',
    p_idempotency_key,
    jsonb_build_object('interview_id', v_interview.id),
    v_request_payload
  );

  INSERT INTO public.notifications (user_id, type, template_key, payload)
  VALUES (
    auth.uid(),
    'BOOKING_RESCHEDULED',
    'booking_rescheduled',
    jsonb_build_object('interview_id', v_interview.id, 'new_starts_at', p_new_starts_at)
  );

  INSERT INTO public.integration_outbox (event_type, aggregate_type, aggregate_id, payload)
  VALUES (
    'interview.rescheduled',
    'interview',
    v_interview.id,
    jsonb_build_object('interview_id', v_interview.id, 'old_starts_at', v_before.starts_at, 'new_starts_at', p_new_starts_at)
  );

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, previous_value, new_value, reason)
  VALUES (
    auth.uid(),
    'interview',
    v_interview.id,
    'RESCHEDULED',
    to_jsonb(v_before),
    to_jsonb(v_interview),
    v_clean_reason
  );

  RETURN v_interview;

EXCEPTION
  WHEN unique_violation OR exclusion_violation THEN
    RAISE EXCEPTION 'booking_conflict' USING errcode = '23505';
END;
$$;

REVOKE ALL ON FUNCTION public.start_interview(uuid, text, public.attendance_status, public.attendance_status, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.complete_interview_session(uuid, text, public.attendance_status, public.attendance_status, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.record_interview_attendance(uuid, public.attendance_status, public.attendance_status, text, boolean, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.get_interview_workspace_detail(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.cancel_student_booking(uuid, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.reschedule_student_booking(uuid, uuid, timestamptz, timestamptz, text, text, text) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.start_interview(uuid, text, public.attendance_status, public.attendance_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_interview_session(uuid, text, public.attendance_status, public.attendance_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_interview_attendance(uuid, public.attendance_status, public.attendance_status, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_interview_workspace_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_student_booking(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_student_booking(uuid, uuid, timestamptz, timestamptz, text, text, text) TO authenticated;
