-- Student-facing interviewer discovery and authoritative slot-input RPCs.
-- Additive migration: adds optional public metadata columns to interviewers,
-- optional interviewer_badge_specialties table, and SECURITY DEFINER discovery RPCs
-- that NEVER expose interviewer emails or other students' PII.

ALTER TABLE public.interviewers
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS expertise_tags text[] NOT NULL DEFAULT '{}'::text[];

CREATE TABLE IF NOT EXISTS public.interviewer_badge_specialties (
  interviewer_id uuid NOT NULL REFERENCES public.interviewers(id) ON DELETE CASCADE,
  badge_id uuid NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (interviewer_id, badge_id)
);

ALTER TABLE public.interviewer_badge_specialties ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.interviewer_badge_specialties TO authenticated;

CREATE POLICY "specialties readable by authenticated" ON public.interviewer_badge_specialties
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "specialties managed by staff" ON public.interviewer_badge_specialties
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- Update accept_interviewer_invitation to copy invitation title/bio/expertise_tags.
CREATE OR REPLACE FUNCTION public.accept_interviewer_invitation(
  p_token_hash text,
  p_full_name text DEFAULT NULL
)
RETURNS public.interviewers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_user_email text;
  v_inv public.interviewer_invitations;
  v_interviewer public.interviewers;
  v_display_name text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING errcode = '28000';
  END IF;

  IF p_token_hash IS NULL OR length(btrim(p_token_hash)) < 32 THEN
    RAISE EXCEPTION 'invalid_invitation_token' USING errcode = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('accept_invite:' || p_token_hash));

  SELECT lower(btrim(u.email))
  INTO v_user_email
  FROM auth.users u
  WHERE u.id = v_uid;

  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING errcode = '28000';
  END IF;

  SELECT * INTO v_inv
  FROM public.interviewer_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found' USING errcode = 'P0002';
  END IF;

  IF v_inv.status = 'REVOKED' THEN
    RAISE EXCEPTION 'invitation_revoked' USING errcode = '23514';
  END IF;

  IF v_inv.status = 'ACCEPTED' THEN
    RAISE EXCEPTION 'invitation_already_accepted' USING errcode = '23514';
  END IF;

  IF v_inv.status = 'EXPIRED' OR v_inv.expires_at <= now() THEN
    UPDATE public.interviewer_invitations
    SET status = 'EXPIRED',
        updated_at = now()
    WHERE id = v_inv.id;

    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, previous_value, new_value, reason)
    VALUES (
      v_uid,
      'interviewer_invitation',
      v_inv.id,
      'EXPIRED',
      jsonb_build_object('status', v_inv.status),
      jsonb_build_object('status', 'EXPIRED'),
      'Attempted acceptance after invitation expiration'
    );

    RAISE EXCEPTION 'invitation_expired' USING errcode = '23514';
  END IF;

  IF lower(btrim(v_inv.email)) <> v_user_email THEN
    RAISE EXCEPTION 'invitation_email_mismatch' USING errcode = '42501';
  END IF;

  v_display_name := coalesce(
    nullif(btrim(coalesce(p_full_name, '')), ''),
    nullif(btrim(coalesce(v_inv.full_name, '')), ''),
    split_part(v_user_email, '@', 1)
  );

  INSERT INTO public.profiles (id, full_name, email, is_active)
  VALUES (v_uid, v_display_name, v_user_email, true)
  ON CONFLICT (id) DO UPDATE
    SET full_name = coalesce(nullif(btrim(coalesce(p_full_name, '')), ''), public.profiles.full_name),
        updated_at = now();

  INSERT INTO public.user_roles (user_id, role, assigned_by)
  VALUES (v_uid, 'INTERVIEWER', v_inv.invited_by)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.interviewers (user_id, is_active, default_timezone, title, bio, expertise_tags)
  VALUES (
    v_uid,
    true,
    v_inv.default_timezone,
    v_inv.title,
    v_inv.bio,
    coalesce(v_inv.expertise_tags, '{}'::text[])
  )
  ON CONFLICT (user_id) DO UPDATE
    SET is_active = true,
        default_timezone = excluded.default_timezone,
        title = coalesce(excluded.title, public.interviewers.title),
        bio = coalesce(excluded.bio, public.interviewers.bio),
        expertise_tags = CASE
          WHEN cardinality(excluded.expertise_tags) > 0 THEN excluded.expertise_tags
          ELSE public.interviewers.expertise_tags
        END
  RETURNING * INTO v_interviewer;

  UPDATE public.interviewer_invitations
  SET status = 'ACCEPTED',
      accepted_by = v_uid,
      accepted_at = now(),
      updated_at = now()
  WHERE id = v_inv.id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, previous_value, new_value, reason)
  VALUES (
    v_uid,
    'interviewer_invitation',
    v_inv.id,
    'ACCEPTED',
    jsonb_build_object('status', 'PENDING'),
    jsonb_build_object('status', 'ACCEPTED', 'accepted_by', v_uid, 'interviewer_id', v_interviewer.id),
    'Interviewer invitation accepted'
  );

  INSERT INTO public.integration_outbox (event_type, aggregate_type, aggregate_id, payload)
  VALUES (
    'interviewer.invitation.accepted',
    'interviewer_invitation',
    v_inv.id,
    jsonb_build_object('invitation_id', v_inv.id, 'user_id', v_uid, 'interviewer_id', v_interviewer.id)
  );

  RETURN v_interviewer;
END;
$$;

-- Safe student/staff directory of active interviewers (never returns email or user_id).
CREATE OR REPLACE FUNCTION public.list_bookable_interviewers(
  p_badge_id uuid DEFAULT NULL
)
RETURNS TABLE (
  interviewer_id uuid,
  display_name text,
  title text,
  bio text,
  expertise_tags text[],
  default_timezone text,
  weekly_windows_count bigint,
  availability_summary jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING errcode = '28000';
  END IF;

  IF NOT (
    public.has_role('STUDENT')
    OR public.is_staff()
    OR public.has_role('INTERVIEWER')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active = true
  ) THEN
    RAISE EXCEPTION 'profile_inactive' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    i.id AS interviewer_id,
    p.full_name AS display_name,
    coalesce(i.title, 'Certified Badge Interviewer') AS title,
    i.bio,
    i.expertise_tags,
    i.default_timezone,
    count(ia.id) AS weekly_windows_count,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'day_of_week', ia.day_of_week,
          'start_time', to_char(ia.start_time, 'HH24:MI'),
          'end_time', to_char(ia.end_time, 'HH24:MI'),
          'timezone', ia.timezone
        )
        ORDER BY ia.day_of_week, ia.start_time
      ) FILTER (WHERE ia.id IS NOT NULL),
      '[]'::jsonb
    ) AS availability_summary
  FROM public.interviewers i
  JOIN public.profiles p ON p.id = i.user_id AND p.is_active = true
  LEFT JOIN public.interviewer_availability ia
    ON ia.interviewer_id = i.id
    AND ia.is_active = true
    AND (ia.effective_until IS NULL OR ia.effective_until >= current_date)
  WHERE i.is_active = true
    AND (
      p_badge_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.interviewer_badge_specialties s WHERE s.interviewer_id = i.id
      )
      OR EXISTS (
        SELECT 1 FROM public.interviewer_badge_specialties s
        WHERE s.interviewer_id = i.id AND s.badge_id = p_badge_id
      )
    )
  GROUP BY i.id, p.full_name, i.title, i.bio, i.expertise_tags, i.default_timezone
  ORDER BY count(ia.id) DESC, p.full_name ASC;
END;
$$;

-- Returns authoritative slot-generation inputs for a badge & date window without leaking PII.
CREATE OR REPLACE FUNCTION public.get_bookable_slot_inputs(
  p_badge_id uuid,
  p_interviewer_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT now(),
  p_to timestamptz DEFAULT (now() + interval '14 days'),
  p_exclude_interview_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_student_id uuid;
  v_badge public.badges;
  v_active_booking_id uuid;
  v_retake_after timestamptz;
  v_interviewers jsonb;
  v_availability jsonb;
  v_overrides jsonb;
  v_busy jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING errcode = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active = true
  ) THEN
    RAISE EXCEPTION 'profile_inactive' USING errcode = '42501';
  END IF;

  IF NOT (public.has_role('STUDENT') OR public.is_staff()) THEN
    RAISE EXCEPTION 'student_role_required' USING errcode = '42501';
  END IF;

  SELECT * INTO v_badge
  FROM public.badges b
  WHERE b.id = p_badge_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'badge_not_found' USING errcode = '23514';
  END IF;

  IF NOT v_badge.is_active THEN
    RAISE EXCEPTION 'badge_inactive' USING errcode = '23514';
  END IF;

  IF p_to <= p_from THEN
    RAISE EXCEPTION 'invalid_time_range' USING errcode = '22023';
  END IF;

  SELECT s.id INTO v_student_id
  FROM public.students s
  WHERE s.user_id = auth.uid();

  IF v_student_id IS NOT NULL THEN
    SELECT iv.id INTO v_active_booking_id
    FROM public.interviews iv
    WHERE iv.student_id = v_student_id
      AND iv.badge_id = p_badge_id
      AND iv.status IN ('BOOKED', 'RESCHEDULE_PENDING', 'IN_PROGRESS', 'AWAITING_OUTCOME')
      AND (p_exclude_interview_id IS NULL OR iv.id <> p_exclude_interview_id)
    LIMIT 1;

    SELECT ir.retake_after INTO v_retake_after
    FROM public.interviews iv
    JOIN public.interview_results ir ON ir.interview_id = iv.id
    WHERE iv.student_id = v_student_id
      AND iv.badge_id = p_badge_id
      AND ir.outcome = 'RETAKE_LATER'
      AND ir.retake_after IS NOT NULL
    ORDER BY ir.submitted_at DESC
    LIMIT 1;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'interviewer_id', i.id,
        'display_name', p.full_name,
        'title', coalesce(i.title, 'Certified Badge Interviewer'),
        'bio', i.bio,
        'expertise_tags', i.expertise_tags,
        'default_timezone', i.default_timezone
      )
      ORDER BY p.full_name ASC
    ),
    '[]'::jsonb
  ) INTO v_interviewers
  FROM public.interviewers i
  JOIN public.profiles p ON p.id = i.user_id AND p.is_active = true
  WHERE i.is_active = true
    AND (p_interviewer_id IS NULL OR i.id = p_interviewer_id)
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.interviewer_badge_specialties s WHERE s.interviewer_id = i.id
      )
      OR EXISTS (
        SELECT 1 FROM public.interviewer_badge_specialties s
        WHERE s.interviewer_id = i.id AND s.badge_id = p_badge_id
      )
    );

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ia.id,
        'interviewer_id', ia.interviewer_id,
        'day_of_week', ia.day_of_week,
        'start_time', to_char(ia.start_time, 'HH24:MI'),
        'end_time', to_char(ia.end_time, 'HH24:MI'),
        'timezone', ia.timezone,
        'effective_from', ia.effective_from::text,
        'effective_until', ia.effective_until::text
      )
    ),
    '[]'::jsonb
  ) INTO v_availability
  FROM public.interviewer_availability ia
  JOIN public.interviewers i ON i.id = ia.interviewer_id AND i.is_active = true
  WHERE ia.is_active = true
    AND (p_interviewer_id IS NULL OR ia.interviewer_id = p_interviewer_id);

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'interviewer_id', ao.interviewer_id,
        'starts_at', ao.starts_at,
        'ends_at', ao.ends_at,
        'kind', ao.kind
      )
    ),
    '[]'::jsonb
  ) INTO v_overrides
  FROM public.availability_overrides ao
  WHERE (p_interviewer_id IS NULL OR ao.interviewer_id = p_interviewer_id)
    AND tstzrange(ao.starts_at, ao.ends_at, '[)') && tstzrange(p_from, p_to, '[)');

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'interviewer_id', iv.interviewer_id,
        'starts_at', iv.starts_at,
        'ends_at', iv.ends_at
      )
    ),
    '[]'::jsonb
  ) INTO v_busy
  FROM public.interviews iv
  WHERE iv.status IN ('BOOKED', 'RESCHEDULE_PENDING', 'IN_PROGRESS', 'AWAITING_OUTCOME')
    AND (p_interviewer_id IS NULL OR iv.interviewer_id = p_interviewer_id)
    AND (p_exclude_interview_id IS NULL OR iv.id <> p_exclude_interview_id)
    AND tstzrange(iv.starts_at, iv.ends_at, '[)') && tstzrange(p_from, p_to, '[)');

  RETURN jsonb_build_object(
    'interviewers', v_interviewers,
    'availability', v_availability,
    'overrides', v_overrides,
    'busy_windows', v_busy,
    'student_state', jsonb_build_object(
      'has_active_booking', v_active_booking_id IS NOT NULL,
      'active_booking_id', v_active_booking_id,
      'retake_after', v_retake_after
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_bookable_interviewers(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.get_bookable_slot_inputs(uuid, uuid, timestamptz, timestamptz, uuid) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.list_bookable_interviewers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bookable_slot_inputs(uuid, uuid, timestamptz, timestamptz, uuid) TO authenticated;
