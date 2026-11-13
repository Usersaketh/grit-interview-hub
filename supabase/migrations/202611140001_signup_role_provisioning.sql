-- Security hardening for public student signup and role provisioning.
-- Additive migration: hardens handle_new_auth_user() so public signups ALWAYS
-- receive only the STUDENT role and a students row, ignoring any client-supplied
-- role metadata. Prevents client privilege escalation on profiles/user_roles/students.

-- Ensure authenticated/anon/public never have write privileges on identity tables.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.profiles FROM public, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_roles FROM public, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.students FROM public, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.interviewers FROM public, anon, authenticated;

-- Enforce that audit_logs is strictly append-only at the database level.
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs_append_only'
    USING errcode = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_audit_log_mutation() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_logs_append_only ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_append_only
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_mutation();

-- Replace handle_new_auth_user() to provision profile + STUDENT role + students row
-- for every public signup. Client raw_user_meta_data->>'role' is completely ignored.
-- Only trusted internal/seed flows setting raw_app_meta_data->>'managed_provision' = 'true'
-- (which clients cannot set via public Supabase Auth signup) skip auto-student provisioning.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_full_name text;
  v_student_code text;
  v_student_id uuid;
  v_managed text;
BEGIN
  v_full_name := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(new.email, '@', 1)
  );

  INSERT INTO public.profiles (id, full_name, email)
  VALUES (new.id, v_full_name, lower(btrim(new.email)))
  ON CONFLICT (id) DO NOTHING;

  v_managed := coalesce(new.raw_app_meta_data->>'managed_provision', '');

  IF v_managed <> 'true' THEN
    INSERT INTO public.user_roles (user_id, role, assigned_by)
    VALUES (new.id, 'STUDENT', new.id)
    ON CONFLICT (user_id, role) DO NOTHING;

    v_student_code := 'GRIT-STU-' || upper(substr(replace(new.id::text, '-', ''), 1, 10));

    INSERT INTO public.students (user_id, external_student_id, campus_ref)
    VALUES (
      new.id,
      v_student_code,
      nullif(btrim(new.raw_user_meta_data->>'campus_ref'), '')
    )
    ON CONFLICT (user_id) DO NOTHING
    RETURNING id INTO v_student_id;

    INSERT INTO public.audit_logs (
      actor_id,
      entity_type,
      entity_id,
      action,
      new_value,
      reason
    )
    VALUES (
      new.id,
      'profile',
      new.id,
      'STUDENT_REGISTERED',
      jsonb_build_object(
        'user_id', new.id,
        'student_id', v_student_id,
        'role', 'STUDENT'
      ),
      'Public student registration'
    );
  END IF;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM public, anon, authenticated;

-- Idempotent fallback helper callable by an authenticated user that ensures a
-- student account exists ONLY when the user holds no privileged roles.
-- Never upgrades or grants INTERVIEWER, OPERATIONS, or ADMIN.
CREATE OR REPLACE FUNCTION public.ensure_student_profile()
RETURNS public.students
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_user record;
  v_student public.students;
  v_has_privileged boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING errcode = '28000';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ensure_student_profile:' || v_uid::text));

  SELECT id, email, raw_user_meta_data
  INTO v_user
  FROM auth.users
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unauthenticated' USING errcode = '28000';
  END IF;

  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    v_uid,
    coalesce(nullif(btrim(v_user.raw_user_meta_data->>'full_name'), ''), split_part(v_user.email, '@', 1)),
    lower(btrim(v_user.email))
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT exists(
    SELECT 1
    FROM public.user_roles
    WHERE user_id = v_uid
      AND role IN ('INTERVIEWER', 'OPERATIONS', 'ADMIN')
  ) INTO v_has_privileged;

  IF v_has_privileged THEN
    RAISE EXCEPTION 'privileged_account_cannot_self_register_student' USING errcode = '42501';
  END IF;

  INSERT INTO public.user_roles (user_id, role, assigned_by)
  VALUES (v_uid, 'STUDENT', v_uid)
  ON CONFLICT (user_id, role) DO NOTHING;

  SELECT * INTO v_student
  FROM public.students
  WHERE user_id = v_uid;

  IF NOT FOUND THEN
    INSERT INTO public.students (user_id, external_student_id, campus_ref)
    VALUES (
      v_uid,
      'GRIT-STU-' || upper(substr(replace(v_uid::text, '-', ''), 1, 10)),
      nullif(btrim(v_user.raw_user_meta_data->>'campus_ref'), '')
    )
    ON CONFLICT (user_id) DO UPDATE SET user_id = excluded.user_id
    RETURNING * INTO v_student;
  END IF;

  RETURN v_student;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_student_profile() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ensure_student_profile() TO authenticated;
