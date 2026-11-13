-- Invitation-only interviewer onboarding.
-- Additive migration: creates interviewer_invitations table (locked to INTERVIEWER role),
-- staff-only management RPCs, and single-use expiring invitation acceptance workflow.

CREATE TABLE IF NOT EXISTS public.interviewer_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (email = lower(btrim(email)) AND length(email) > 3),
  full_name text,
  default_timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  title text,
  bio text,
  expertise_tags text[] NOT NULL DEFAULT '{}'::text[],
  token_hash text NOT NULL UNIQUE,
  invited_role public.app_role NOT NULL DEFAULT 'INTERVIEWER' CHECK (invited_role = 'INTERVIEWER'),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
  expires_at timestamptz NOT NULL,
  invited_by uuid NOT NULL REFERENCES public.profiles(id),
  accepted_by uuid REFERENCES public.profiles(id),
  accepted_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id),
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS interviewer_invitations_one_pending_email
  ON public.interviewer_invitations (lower(email))
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS interviewer_invitations_status_idx
  ON public.interviewer_invitations (status, created_at DESC);

ALTER TABLE public.interviewer_invitations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.interviewer_invitations FROM public, anon, authenticated;

CREATE POLICY "interviewer invitations staff" ON public.interviewer_invitations
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- Staff-only: create an interviewer invitation using a pre-hashed single-use token.
CREATE OR REPLACE FUNCTION public.create_interviewer_invitation(
  p_email text,
  p_full_name text,
  p_default_timezone text,
  p_title text,
  p_expertise_tags text[],
  p_token_hash text,
  p_expires_at timestamptz,
  p_idempotency_key text
)
RETURNS public.interviewer_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
  v_existing_idem public.idempotency_records;
  v_invitation public.interviewer_invitations;
  v_request_payload jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING errcode = '28000';
  END IF;

  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'staff_role_required' USING errcode = '42501';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING errcode = '22023';
  END IF;

  v_email := lower(btrim(coalesce(p_email, '')));
  IF v_email = '' OR position('@' IN v_email) = 0 THEN
    RAISE EXCEPTION 'invalid_email' USING errcode = '22023';
  END IF;

  IF p_token_hash IS NULL OR length(btrim(p_token_hash)) < 32 THEN
    RAISE EXCEPTION 'invalid_token_hash' USING errcode = '22023';
  END IF;

  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'invalid_expiration' USING errcode = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(auth.uid()::text || ':invite:' || p_idempotency_key));

  v_request_payload := jsonb_build_object(
    'email', v_email,
    'full_name', nullif(btrim(coalesce(p_full_name, '')), ''),
    'default_timezone', coalesce(nullif(btrim(coalesce(p_default_timezone, '')), ''), 'Asia/Kolkata'),
    'title', nullif(btrim(coalesce(p_title, '')), ''),
    'expertise_tags', coalesce(p_expertise_tags, '{}'::text[])
  );

  SELECT * INTO v_existing_idem
  FROM public.idempotency_records
  WHERE actor_id = auth.uid()
    AND operation = 'create_interviewer_invitation'
    AND key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_idem.request_payload IS DISTINCT FROM v_request_payload THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING errcode = 'P0001';
    END IF;
    SELECT * INTO v_invitation
    FROM public.interviewer_invitations
    WHERE id = (v_existing_idem.response->>'invitation_id')::uuid;
    RETURN v_invitation;
  END IF;

  -- Expire any stale pending invitation for this email before checking uniqueness.
  UPDATE public.interviewer_invitations
  SET status = 'EXPIRED',
      updated_at = now()
  WHERE lower(email) = v_email
    AND status = 'PENDING'
    AND expires_at <= now();

  IF EXISTS (
    SELECT 1
    FROM public.interviewer_invitations
    WHERE lower(email) = v_email
      AND status = 'PENDING'
      AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'pending_invitation_exists' USING errcode = '23505';
  END IF;

  INSERT INTO public.interviewer_invitations (
    email,
    full_name,
    default_timezone,
    title,
    expertise_tags,
    token_hash,
    invited_role,
    status,
    expires_at,
    invited_by
  )
  VALUES (
    v_email,
    nullif(btrim(coalesce(p_full_name, '')), ''),
    coalesce(nullif(btrim(coalesce(p_default_timezone, '')), ''), 'Asia/Kolkata'),
    nullif(btrim(coalesce(p_title, '')), ''),
    coalesce(p_expertise_tags, '{}'::text[]),
    p_token_hash,
    'INTERVIEWER',
    'PENDING',
    p_expires_at,
    auth.uid()
  )
  RETURNING * INTO v_invitation;

  INSERT INTO public.idempotency_records (actor_id, operation, key, response, request_payload)
  VALUES (
    auth.uid(),
    'create_interviewer_invitation',
    p_idempotency_key,
    jsonb_build_object('invitation_id', v_invitation.id),
    v_request_payload
  );

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, new_value, reason)
  VALUES (
    auth.uid(),
    'interviewer_invitation',
    v_invitation.id,
    'CREATED',
    jsonb_build_object(
      'id', v_invitation.id,
      'email', v_invitation.email,
      'invited_role', v_invitation.invited_role,
      'expires_at', v_invitation.expires_at
    ),
    'Interviewer invitation issued for ' || v_email
  );

  INSERT INTO public.integration_outbox (event_type, aggregate_type, aggregate_id, payload)
  VALUES (
    'interviewer.invitation.created',
    'interviewer_invitation',
    v_invitation.id,
    jsonb_build_object(
      'invitation_id', v_invitation.id,
      'email', v_invitation.email,
      'expires_at', v_invitation.expires_at
    )
  );

  RETURN v_invitation;
END;
$$;

-- Staff-only: list interviewer invitations (marking overdue pending invitations EXPIRED).
CREATE OR REPLACE FUNCTION public.list_interviewer_invitations()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  default_timezone text,
  title text,
  expertise_tags text[],
  invited_role public.app_role,
  status text,
  expires_at timestamptz,
  invited_by uuid,
  invited_by_name text,
  accepted_by uuid,
  accepted_at timestamptz,
  revoked_by uuid,
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expired_row public.interviewer_invitations;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING errcode = '28000';
  END IF;

  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'staff_role_required' USING errcode = '42501';
  END IF;

  FOR v_expired_row IN
    UPDATE public.interviewer_invitations ii
    SET status = 'EXPIRED',
        updated_at = now()
    WHERE ii.status = 'PENDING'
      AND ii.expires_at <= now()
    RETURNING *
  LOOP
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, previous_value, new_value, reason)
    VALUES (
      auth.uid(),
      'interviewer_invitation',
      v_expired_row.id,
      'EXPIRED',
      jsonb_build_object('status', 'PENDING'),
      jsonb_build_object('status', 'EXPIRED'),
      'Invitation expired past deadline'
    );
  END LOOP;

  RETURN QUERY
  SELECT
    ii.id,
    ii.email,
    ii.full_name,
    ii.default_timezone,
    ii.title,
    ii.expertise_tags,
    ii.invited_role,
    ii.status,
    ii.expires_at,
    ii.invited_by,
    p.full_name AS invited_by_name,
    ii.accepted_by,
    ii.accepted_at,
    ii.revoked_by,
    ii.revoked_at,
    ii.revocation_reason,
    ii.created_at
  FROM public.interviewer_invitations ii
  LEFT JOIN public.profiles p ON p.id = ii.invited_by
  ORDER BY ii.created_at DESC;
END;
$$;

-- Staff-only: revoke a pending invitation.
CREATE OR REPLACE FUNCTION public.revoke_interviewer_invitation(
  p_invitation_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS public.interviewer_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_idem public.idempotency_records;
  v_inv public.interviewer_invitations;
  v_inv_before public.interviewer_invitations;
  v_request_payload jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING errcode = '28000';
  END IF;

  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'staff_role_required' USING errcode = '42501';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING errcode = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(auth.uid()::text || ':revoke_invite:' || p_idempotency_key));

  v_request_payload := jsonb_build_object(
    'invitation_id', p_invitation_id,
    'reason', nullif(btrim(coalesce(p_reason, '')), '')
  );

  SELECT * INTO v_existing_idem
  FROM public.idempotency_records
  WHERE actor_id = auth.uid()
    AND operation = 'revoke_interviewer_invitation'
    AND key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_idem.request_payload IS DISTINCT FROM v_request_payload THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING errcode = 'P0001';
    END IF;
    SELECT * INTO v_inv
    FROM public.interviewer_invitations
    WHERE id = (v_existing_idem.response->>'invitation_id')::uuid;
    RETURN v_inv;
  END IF;

  SELECT * INTO v_inv
  FROM public.interviewer_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found' USING errcode = 'P0002';
  END IF;

  IF v_inv.status <> 'PENDING' THEN
    RAISE EXCEPTION 'invitation_not_pending' USING errcode = '23514';
  END IF;

  v_inv_before := v_inv;

  UPDATE public.interviewer_invitations
  SET status = 'REVOKED',
      revoked_by = auth.uid(),
      revoked_at = now(),
      revocation_reason = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Revoked by staff'),
      updated_at = now()
  WHERE id = p_invitation_id
  RETURNING * INTO v_inv;

  INSERT INTO public.idempotency_records (actor_id, operation, key, response, request_payload)
  VALUES (
    auth.uid(),
    'revoke_interviewer_invitation',
    p_idempotency_key,
    jsonb_build_object('invitation_id', v_inv.id),
    v_request_payload
  );

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, previous_value, new_value, reason)
  VALUES (
    auth.uid(),
    'interviewer_invitation',
    v_inv.id,
    'REVOKED',
    jsonb_build_object('status', v_inv_before.status),
    jsonb_build_object('status', v_inv.status, 'revoked_at', v_inv.revoked_at),
    v_inv.revocation_reason
  );

  INSERT INTO public.integration_outbox (event_type, aggregate_type, aggregate_id, payload)
  VALUES (
    'interviewer.invitation.revoked',
    'interviewer_invitation',
    v_inv.id,
    jsonb_build_object('invitation_id', v_inv.id, 'email', v_inv.email)
  );

  RETURN v_inv;
END;
$$;

-- Authenticated acceptance of a pending invitation by an authenticated user whose email matches.
-- Also called via service-role or user session after creating/authenticating the Supabase Auth user.
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

  -- Strictly assign INTERVIEWER role only; never OPERATIONS or ADMIN.
  INSERT INTO public.user_roles (user_id, role, assigned_by)
  VALUES (v_uid, 'INTERVIEWER', v_inv.invited_by)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.interviewers (user_id, is_active, default_timezone)
  VALUES (v_uid, true, v_inv.default_timezone)
  ON CONFLICT (user_id) DO UPDATE
    SET is_active = true,
        default_timezone = excluded.default_timezone
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

REVOKE ALL ON FUNCTION public.create_interviewer_invitation(text, text, text, text, text[], text, timestamptz, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.list_interviewer_invitations() FROM public, anon;
REVOKE ALL ON FUNCTION public.revoke_interviewer_invitation(uuid, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.accept_interviewer_invitation(text, text) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.create_interviewer_invitation(text, text, text, text, text[], text, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_interviewer_invitations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_interviewer_invitation(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_interviewer_invitation(text, text) TO authenticated;
