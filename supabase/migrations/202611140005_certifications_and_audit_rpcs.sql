-- Staff-only badge certification queue read RPCs and paginated audit log read RPC.
-- Preserves strict revocation of direct SELECT on badge_awards, malpractice_reports, and audit_logs.

-- 1. Staff-only certification queue & history list.
CREATE OR REPLACE FUNCTION public.list_badge_certifications(
  p_status public.certification_status DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  student_id uuid,
  student_name text,
  external_student_id text,
  campus_ref text,
  badge_id uuid,
  badge_name text,
  badge_level text,
  track_name text,
  interview_result_id uuid,
  interview_id uuid,
  booking_reference text,
  outcome public.evaluation_outcome,
  feedback text,
  evaluator_name text,
  submitted_at timestamptz,
  status public.certification_status,
  external_award_id text,
  awarded_at timestamptz,
  nullified_at timestamptz,
  reinstated_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_q text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING errcode = '28000';
  END IF;

  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'staff_role_required' USING errcode = '42501';
  END IF;

  v_q := nullif(lower(btrim(coalesce(p_search, ''))), '');

  RETURN QUERY
  SELECT
    ba.id,
    ba.student_id,
    sp.full_name AS student_name,
    s.external_student_id,
    s.campus_ref,
    ba.badge_id,
    b.name AS badge_name,
    b.level AS badge_level,
    t.name AS track_name,
    ba.interview_result_id,
    ir.interview_id,
    iv.booking_reference,
    ir.outcome,
    ir.feedback,
    evp.full_name AS evaluator_name,
    ir.submitted_at,
    ba.status,
    ba.external_award_id,
    ba.awarded_at,
    ba.nullified_at,
    ba.reinstated_at,
    ba.created_at
  FROM public.badge_awards ba
  JOIN public.students s ON s.id = ba.student_id
  JOIN public.profiles sp ON sp.id = s.user_id
  JOIN public.badges b ON b.id = ba.badge_id
  JOIN public.tracks t ON t.id = b.track_id
  LEFT JOIN public.interview_results ir ON ir.id = ba.interview_result_id
  LEFT JOIN public.interviews iv ON iv.id = ir.interview_id
  LEFT JOIN public.profiles evp ON evp.id = ir.evaluator_id
  WHERE (p_status IS NULL OR ba.status = p_status)
    AND (
      v_q IS NULL
      OR lower(sp.full_name) LIKE '%' || v_q || '%'
      OR lower(s.external_student_id) LIKE '%' || v_q || '%'
      OR lower(b.name) LIKE '%' || v_q || '%'
      OR lower(coalesce(iv.booking_reference, '')) LIKE '%' || v_q || '%'
      OR lower(ba.id::text) LIKE '%' || v_q || '%'
    )
  ORDER BY
    CASE WHEN ba.status = 'CERTIFICATION_PENDING' THEN 0 ELSE 1 END,
    ba.created_at DESC;
END;
$$;

-- 2. Staff-only single badge certification detail.
CREATE OR REPLACE FUNCTION public.get_badge_certification_detail(
  p_badge_award_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row jsonb;
  v_reinstatements jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING errcode = '28000';
  END IF;

  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'staff_role_required' USING errcode = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', ba.id,
    'student_id', ba.student_id,
    'student_name', sp.full_name,
    'external_student_id', s.external_student_id,
    'campus_ref', s.campus_ref,
    'badge_id', ba.badge_id,
    'badge_name', b.name,
    'badge_level', b.level,
    'track_name', t.name,
    'interview_result_id', ba.interview_result_id,
    'interview_id', ir.interview_id,
    'booking_reference', iv.booking_reference,
    'interview_starts_at', iv.starts_at,
    'interview_timezone', iv.timezone,
    'outcome', ir.outcome,
    'feedback', ir.feedback,
    'evaluator_name', evp.full_name,
    'submitted_at', ir.submitted_at,
    'status', ba.status,
    'external_award_id', ba.external_award_id,
    'awarded_at', ba.awarded_at,
    'nullified_at', ba.nullified_at,
    'reinstated_at', ba.reinstated_at,
    'created_at', ba.created_at
  )
  INTO v_row
  FROM public.badge_awards ba
  JOIN public.students s ON s.id = ba.student_id
  JOIN public.profiles sp ON sp.id = s.user_id
  JOIN public.badges b ON b.id = ba.badge_id
  JOIN public.tracks t ON t.id = b.track_id
  LEFT JOIN public.interview_results ir ON ir.id = ba.interview_result_id
  LEFT JOIN public.interviews iv ON iv.id = ir.interview_id
  LEFT JOIN public.profiles evp ON evp.id = ir.evaluator_id
  WHERE ba.id = p_badge_award_id;

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'badge_award_not_found' USING errcode = 'P0002';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', br.id,
        'malpractice_report_id', br.malpractice_report_id,
        'reason', br.reason,
        'approved_by', br.approved_by,
        'reinstated_at', br.reinstated_at
      )
      ORDER BY br.reinstated_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_reinstatements
  FROM public.badge_reinstatements br
  WHERE br.badge_award_id = p_badge_award_id;

  RETURN v_row || jsonb_build_object('reinstatements', v_reinstatements);
END;
$$;

-- 3. Staff-only paginated audit log reader.
CREATE OR REPLACE FUNCTION public.list_audit_logs(
  p_actor_id uuid DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  actor_id uuid,
  actor_name text,
  actor_email text,
  entity_type text,
  entity_id uuid,
  action text,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer;
  v_offset integer;
  v_q text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING errcode = '28000';
  END IF;

  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'staff_role_required' USING errcode = '42501';
  END IF;

  v_limit := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset := greatest(0, coalesce(p_offset, 0));
  v_q := nullif(lower(btrim(coalesce(p_search, ''))), '');

  RETURN QUERY
  SELECT
    al.id,
    al.actor_id,
    p.full_name AS actor_name,
    p.email AS actor_email,
    al.entity_type,
    al.entity_id,
    al.action,
    al.previous_value,
    al.new_value,
    al.reason,
    al.created_at,
    count(*) OVER () AS total_count
  FROM public.audit_logs al
  LEFT JOIN public.profiles p ON p.id = al.actor_id
  WHERE (p_actor_id IS NULL OR al.actor_id = p_actor_id)
    AND (p_entity_type IS NULL OR al.entity_type = p_entity_type)
    AND (p_entity_id IS NULL OR al.entity_id = p_entity_id)
    AND (p_action IS NULL OR al.action = p_action)
    AND (p_from IS NULL OR al.created_at >= p_from)
    AND (p_to IS NULL OR al.created_at <= p_to)
    AND (
      v_q IS NULL
      OR lower(coalesce(p.full_name, '')) LIKE '%' || v_q || '%'
      OR lower(coalesce(p.email, '')) LIKE '%' || v_q || '%'
      OR lower(al.entity_type) LIKE '%' || v_q || '%'
      OR lower(al.action) LIKE '%' || v_q || '%'
      OR lower(al.entity_id::text) LIKE '%' || v_q || '%'
      OR lower(coalesce(al.reason, '')) LIKE '%' || v_q || '%'
    )
  ORDER BY al.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.list_badge_certifications(public.certification_status, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.get_badge_certification_detail(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.list_audit_logs(uuid, text, uuid, text, text, timestamptz, timestamptz, integer, integer) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.list_badge_certifications(public.certification_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_badge_certification_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_audit_logs(uuid, text, uuid, text, text, timestamptz, timestamptz, integer, integer) TO authenticated;
