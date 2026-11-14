-- Final Product Refinement & Assignment Compliance Migration (Additive)
-- 1. Grants read access to tracks, skills, and notifications for authenticated users (protected by existing RLS).
-- 2. Adds descriptive metadata columns to tracks & badges and populates 4 realistic badge tracks (20 badges + skills).
-- 3. Updates handle_new_auth_user() & ensure_student_profile() so Supabase Auth interviewer invitations never auto-provision STUDENT.
-- 4. Adds accept_interviewer_invitation_by_id() for Supabase Auth verified session onboarding.
-- 5. Enriches book_interview(), submit_interview_result(), and approve_badge_certification() to persist structured student messages + adds mark_student_notification_read().

-- ===========================================================================
-- 1. Minimum authenticated read grants + additive catalog description columns
-- ===========================================================================
GRANT SELECT ON TABLE public.tracks, public.skills, public.notifications TO authenticated;

ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.badges
  ADD COLUMN IF NOT EXISTS description text;

-- ===========================================================================
-- 2. Realistic Badge Catalogue (4 tracks, 20 badges, skills, required mappings)
--    Zero fabricated student skill progress, interview results, or badge awards.
-- ===========================================================================
INSERT INTO public.tracks (id, external_id, name, description, is_active)
VALUES
  (
    '30000000-0000-4000-8000-000000000001',
    'TRK-SWE',
    'Software Engineering',
    'End-to-end application engineering covering transactional backends, accessible frontends, distributed resilience, and security verification.',
    true
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    'TRK-AI',
    'AI & Generative Intelligence',
    'Production LLM systems, structured prompting, retrieval-augmented generation, automated evaluation guardrails, and agentic tool orchestration.',
    true
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    'TRK-ML',
    'Machine Learning & Data Science',
    'Statistical rigor, feature engineering, neural architectures, temporal experimentation, and reproducible MLOps serving pipelines.',
    true
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    'TRK-CLOUD',
    'Cloud & Infrastructure',
    'Linux networking, container orchestration, declarative infrastructure-as-code, observability, and resilient cloud operations.',
    true
  )
ON CONFLICT (id) DO UPDATE
  SET external_id = excluded.external_id,
      name = excluded.name,
      description = excluded.description,
      is_active = true;

INSERT INTO public.badges (id, track_id, external_id, name, level, description, is_active)
VALUES
  -- Software Engineering (5 badges)
  (
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'DEMO-FSD-L1',
    'Full Stack Foundations',
    'Level 1',
    'Core JavaScript and TypeScript execution semantics, relational SQL data modeling, and cleanly structured REST APIs.',
    true
  ),
  (
    '40000000-0000-4000-8000-000000000012',
    '30000000-0000-4000-8000-000000000001',
    'BADGE-SWE-L2',
    'Backend APIs & Transactional Systems',
    'Level 2',
    'Idempotent endpoints, PostgreSQL ACID transactions, exclusion constraints, and strict schema validation at API boundaries.',
    true
  ),
  (
    '40000000-0000-4000-8000-000000000013',
    '30000000-0000-4000-8000-000000000001',
    'BADGE-SWE-L2B',
    'Frontend Architecture & Accessibility',
    'Level 2',
    'Modular React state boundaries, WCAG keyboard accessibility, responsive layouts, and predictable client-side data caching.',
    true
  ),
  (
    '40000000-0000-4000-8000-000000000014',
    '30000000-0000-4000-8000-000000000001',
    'BADGE-SWE-L3',
    'Distributed Systems & Resilience',
    'Level 3',
    'Transactional outbox patterns, rate limiting, backpressure control, fault isolation, and graceful recovery under load.',
    true
  ),
  (
    '40000000-0000-4000-8000-000000000015',
    '30000000-0000-4000-8000-000000000001',
    'BADGE-SWE-L3B',
    'Application Security & Testing',
    'Level 3',
    'Row-Level Security enforcement, RBAC authorization invariants, threat modeling, and automated unit/integration test coverage.',
    true
  ),
  -- AI & Generative Intelligence (5 badges)
  (
    '40000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    'BADGE-AI-L1',
    'Prompt Engineering & Structured Outputs',
    'Level 1',
    'Designing deterministic prompts, JSON schema constrained outputs, and repeatable verification rubrics for production LLM workflows.',
    true
  ),
  (
    '40000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000002',
    'BADGE-AI-L2',
    'Retrieval-Augmented Generation Systems',
    'Level 2',
    'Document chunking strategies, vector indexing, hybrid semantic-lexical search, grounding checks, and citation accuracy verification.',
    true
  ),
  (
    '40000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000002',
    'BADGE-AI-L2B',
    'LLM Evaluation & Guardrails',
    'Level 2',
    'Offline eval harnesses, golden regression suites, prompt-injection defense, and automated hallucination detection.',
    true
  ),
  (
    '40000000-0000-4000-8000-000000000005',
    '30000000-0000-4000-8000-000000000002',
    'BADGE-AI-L3',
    'Agentic Workflows & Tool Calling',
    'Level 3',
    'Multi-step function calling, bounded execution loops, human-in-the-loop safety gates, and tool execution telemetry.',
    true
  ),
  (
    '40000000-0000-4000-8000-000000000006',
    '30000000-0000-4000-8000-000000000002',
    'BADGE-AI-L3B',
    'Multimodal & Production AI Architecture',
    'Level 3',
    'Model routing for latency and cost SLAs, streaming synthesis, vision-text pipelines, and enterprise governance compliance.',
    true
  ),
  -- Machine Learning & Data Science (5 badges)
  (
    '40000000-0000-4000-8000-000000000007',
    '30000000-0000-4000-8000-000000000003',
    'BADGE-ML-L1',
    'Exploratory Data Analysis & Statistics',
    'Level 1',
    'Hypothesis testing, distribution diagnostics, missing-data imputation tradeoffs, and leakage-free dataset splitting.',
    true
  ),
  (
    '40000000-0000-4000-8000-000000000008',
    '30000000-0000-4000-8000-000000000003',
    'BADGE-ML-L2',
    'Supervised Learning & Feature Engineering',
    'Level 2',
    'Regression and classification pipelines, stratified cross-validation, regularization, and calibrated error analysis.',
    true
  ),
  (
    '40000000-0000-4000-8000-000000000009',
    '30000000-0000-4000-8000-000000000003',
    'BADGE-ML-L2B',
    'Deep Learning & Neural Architectures',
    'Level 2',
    'PyTorch training loops, attention mechanics, gradient diagnostics, regularization, and transfer learning fine-tuning.',
    true
  ),
  (
    '40000000-0000-4000-8000-000000000010',
    '30000000-0000-4000-8000-000000000003',
    'BADGE-ML-L3',
    'Time-Series Forecasting & Experimentation',
    'Level 3',
    'Temporal backtesting, seasonality decomposition, uplift A/B experiment design, and sequential decision metrics.',
    true
  ),
  (
    '40000000-0000-4000-8000-000000000011',
    '30000000-0000-4000-8000-000000000003',
    'BADGE-ML-L3B',
    'MLOps & Model Serving Pipelines',
    'Level 3',
    'Feature stores, model registries, covariate drift monitoring, canary rollouts, and low-latency batch/real-time inference.',
    true
  ),
  -- Cloud & Infrastructure (5 badges)
  (
    '40000000-0000-4000-8000-000000000016',
    '30000000-0000-4000-8000-000000000004',
    'BADGE-CLD-L1',
    'Cloud Networking & Linux Fundamentals',
    'Level 1',
    'VPC subnetting, DNS resolution, TLS termination, process isolation, and Linux system diagnostics.',
    true
  ),
  (
    '40000000-0000-4000-8000-000000000017',
    '30000000-0000-4000-8000-000000000004',
    'BADGE-CLD-L2',
    'Containers & Kubernetes Operations',
    'Level 2',
    'Multi-stage Docker image hardening, Kubernetes pod scheduling, liveness/readiness probes, and rolling upgrades.',
    true
  ),
  (
    '40000000-0000-4000-8000-000000000018',
    '30000000-0000-4000-8000-000000000004',
    'BADGE-CLD-L2B',
    'Infrastructure as Code & CI/CD',
    'Level 2',
    'Modular Terraform provisioning, state locking, automated CI/CD verification gates, and secrets rotation.',
    true
  ),
  (
    '40000000-0000-4000-8000-000000000019',
    '30000000-0000-4000-8000-000000000004',
    'BADGE-CLD-L3',
    'Observability & Incident Response',
    'Level 3',
    'Structured telemetry, OpenTelemetry distributed tracing, error-budget SLO alerts, and blameless incident runbooks.',
    true
  ),
  (
    '40000000-0000-4000-8000-000000000020',
    '30000000-0000-4000-8000-000000000004',
    'BADGE-CLD-L3B',
    'Cloud Reliability & Cost Governance',
    'Level 3',
    'Multi-region failover architecture, autoscaling tuning, automated backup drills, and FinOps capacity governance.',
    true
  )
ON CONFLICT (id) DO UPDATE
  SET track_id = excluded.track_id,
      external_id = excluded.external_id,
      name = excluded.name,
      level = excluded.level,
      description = excluded.description,
      is_active = true;

INSERT INTO public.skills (id, external_id, name)
VALUES
  ('50000000-0000-4000-8000-000000000001', 'DEMO-JS', 'JavaScript'),
  ('50000000-0000-4000-8000-000000000002', 'DEMO-DB', 'Databases'),
  ('50000000-0000-4000-8000-000000000003', 'SKL-PROMPT', 'Prompt Design & Schemas'),
  ('50000000-0000-4000-8000-000000000004', 'SKL-LLM-API', 'LLM API Integration'),
  ('50000000-0000-4000-8000-000000000005', 'SKL-VECTOR', 'Vector Indexing & Retrieval'),
  ('50000000-0000-4000-8000-000000000006', 'SKL-EVALS', 'Automated AI Evals'),
  ('50000000-0000-4000-8000-000000000007', 'SKL-AGENTS', 'Tool Calling & Orchestration'),
  ('50000000-0000-4000-8000-000000000008', 'SKL-AI-ARCH', 'Multimodal AI Routing'),
  ('50000000-0000-4000-8000-000000000009', 'SKL-STATS', 'Applied Statistics & EDA'),
  ('50000000-0000-4000-8000-000000000010', 'SKL-PYTHON', 'Python Data Tooling'),
  ('50000000-0000-4000-8000-000000000011', 'SKL-FEAT', 'Feature Engineering'),
  ('50000000-0000-4000-8000-000000000012', 'SKL-DL', 'Neural Networks & PyTorch'),
  ('50000000-0000-4000-8000-000000000013', 'SKL-TS', 'Forecasting & A/B Testing'),
  ('50000000-0000-4000-8000-000000000014', 'SKL-MLOPS', 'Model Serving & Drift Monitoring'),
  ('50000000-0000-4000-8000-000000000015', 'SKL-API-TX', 'Transactional Backend APIs'),
  ('50000000-0000-4000-8000-000000000016', 'SKL-FE-A11Y', 'React & Web Accessibility'),
  ('50000000-0000-4000-8000-000000000017', 'SKL-DIST', 'Distributed Systems Patterns'),
  ('50000000-0000-4000-8000-000000000018', 'SKL-SEC', 'Application Security & RLS'),
  ('50000000-0000-4000-8000-000000000019', 'SKL-NET-LNX', 'Linux & Cloud Networking'),
  ('50000000-0000-4000-8000-000000000020', 'SKL-K8S', 'Containers & Kubernetes'),
  ('50000000-0000-4000-8000-000000000021', 'SKL-IAC', 'Terraform & CI/CD Pipelines'),
  ('50000000-0000-4000-8000-000000000022', 'SKL-OBS-SRE', 'Observability & Cloud SRE')
ON CONFLICT (id) DO UPDATE
  SET external_id = excluded.external_id,
      name = excluded.name;

INSERT INTO public.badge_required_skills (badge_id, skill_id, required_level)
VALUES
  -- Software Engineering
  ('40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 1),
  ('40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', 1),
  ('40000000-0000-4000-8000-000000000012', '50000000-0000-4000-8000-000000000002', 2),
  ('40000000-0000-4000-8000-000000000012', '50000000-0000-4000-8000-000000000015', 2),
  ('40000000-0000-4000-8000-000000000013', '50000000-0000-4000-8000-000000000001', 2),
  ('40000000-0000-4000-8000-000000000013', '50000000-0000-4000-8000-000000000016', 2),
  ('40000000-0000-4000-8000-000000000014', '50000000-0000-4000-8000-000000000015', 2),
  ('40000000-0000-4000-8000-000000000014', '50000000-0000-4000-8000-000000000017', 3),
  ('40000000-0000-4000-8000-000000000015', '50000000-0000-4000-8000-000000000015', 2),
  ('40000000-0000-4000-8000-000000000015', '50000000-0000-4000-8000-000000000018', 3),
  -- AI & Generative Intelligence
  ('40000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000003', 1),
  ('40000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000004', 1),
  ('40000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000004', 2),
  ('40000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000005', 2),
  ('40000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000003', 2),
  ('40000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000006', 2),
  ('40000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000006', 2),
  ('40000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000007', 3),
  ('40000000-0000-4000-8000-000000000006', '50000000-0000-4000-8000-000000000007', 2),
  ('40000000-0000-4000-8000-000000000006', '50000000-0000-4000-8000-000000000008', 3),
  -- Machine Learning & Data Science
  ('40000000-0000-4000-8000-000000000007', '50000000-0000-4000-8000-000000000009', 1),
  ('40000000-0000-4000-8000-000000000007', '50000000-0000-4000-8000-000000000010', 1),
  ('40000000-0000-4000-8000-000000000008', '50000000-0000-4000-8000-000000000010', 2),
  ('40000000-0000-4000-8000-000000000008', '50000000-0000-4000-8000-000000000011', 2),
  ('40000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000010', 2),
  ('40000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000012', 2),
  ('40000000-0000-4000-8000-000000000010', '50000000-0000-4000-8000-000000000009', 2),
  ('40000000-0000-4000-8000-000000000010', '50000000-0000-4000-8000-000000000013', 3),
  ('40000000-0000-4000-8000-000000000011', '50000000-0000-4000-8000-000000000011', 2),
  ('40000000-0000-4000-8000-000000000011', '50000000-0000-4000-8000-000000000014', 3),
  -- Cloud & Infrastructure
  ('40000000-0000-4000-8000-000000000016', '50000000-0000-4000-8000-000000000019', 1),
  ('40000000-0000-4000-8000-000000000016', '50000000-0000-4000-8000-000000000002', 1),
  ('40000000-0000-4000-8000-000000000017', '50000000-0000-4000-8000-000000000019', 2),
  ('40000000-0000-4000-8000-000000000017', '50000000-0000-4000-8000-000000000020', 2),
  ('40000000-0000-4000-8000-000000000018', '50000000-0000-4000-8000-000000000020', 2),
  ('40000000-0000-4000-8000-000000000018', '50000000-0000-4000-8000-000000000021', 2),
  ('40000000-0000-4000-8000-000000000019', '50000000-0000-4000-8000-000000000020', 2),
  ('40000000-0000-4000-8000-000000000019', '50000000-0000-4000-8000-000000000022', 3),
  ('40000000-0000-4000-8000-000000000020', '50000000-0000-4000-8000-000000000021', 2),
  ('40000000-0000-4000-8000-000000000020', '50000000-0000-4000-8000-000000000022', 3)
ON CONFLICT (badge_id, skill_id) DO NOTHING;

-- ===========================================================================
-- 3. Harden handle_new_auth_user() & ensure_student_profile() for Supabase Auth Invites
-- ===========================================================================
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
  v_email text;
  v_is_invited boolean;
BEGIN
  v_email := lower(btrim(coalesce(new.email, '')));
  v_full_name := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(v_email, '@', 1)
  );

  INSERT INTO public.profiles (id, full_name, email)
  VALUES (new.id, v_full_name, v_email)
  ON CONFLICT (id) DO NOTHING;

  v_managed := coalesce(new.raw_app_meta_data->>'managed_provision', '');
  v_is_invited := (new.invited_at IS NOT NULL) OR EXISTS (
    SELECT 1
    FROM public.interviewer_invitations ii
    WHERE lower(btrim(ii.email)) = v_email
      AND ii.status = 'PENDING'
      AND ii.expires_at > now()
  );

  IF v_managed <> 'true' AND NOT v_is_invited THEN
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
  v_has_pending_invite boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING errcode = '28000';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ensure_student_profile:' || v_uid::text));

  SELECT id, email, invited_at, raw_user_meta_data
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

  SELECT (v_user.invited_at IS NOT NULL) OR exists(
    SELECT 1
    FROM public.interviewer_invitations ii
    WHERE lower(btrim(ii.email)) = lower(btrim(v_user.email))
      AND ii.status = 'PENDING'
      AND ii.expires_at > now()
  ) INTO v_has_pending_invite;

  IF v_has_pending_invite THEN
    RAISE EXCEPTION 'invited_account_cannot_self_register_student' USING errcode = '42501';
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

-- ===========================================================================
-- 4. Supabase Auth Session-Bound Invitation Acceptance RPC
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.accept_interviewer_invitation_by_id(
  p_invitation_id uuid,
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

  IF p_invitation_id IS NULL THEN
    RAISE EXCEPTION 'invitation_not_found' USING errcode = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('accept_invite_id:' || p_invitation_id::text));

  SELECT lower(btrim(u.email))
  INTO v_user_email
  FROM auth.users u
  WHERE u.id = v_uid;

  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING errcode = '28000';
  END IF;

  SELECT * INTO v_inv
  FROM public.interviewer_invitations
  WHERE id = p_invitation_id
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

  INSERT INTO public.interviewers (user_id, is_active, default_timezone, title, expertise_tags)
  VALUES (
    v_uid,
    true,
    v_inv.default_timezone,
    coalesce(nullif(btrim(coalesce(v_inv.title, '')), ''), 'Certified Badge Interviewer'),
    coalesce(v_inv.expertise_tags, '{}'::text[])
  )
  ON CONFLICT (user_id) DO UPDATE
    SET is_active = true,
        default_timezone = excluded.default_timezone,
        title = coalesce(nullif(btrim(coalesce(v_inv.title, '')), ''), public.interviewers.title),
        expertise_tags = CASE
          WHEN coalesce(array_length(v_inv.expertise_tags, 1), 0) > 0 THEN v_inv.expertise_tags
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
    'Interviewer invitation accepted via Supabase Auth verification'
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

REVOKE ALL ON FUNCTION public.accept_interviewer_invitation_by_id(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_interviewer_invitation_by_id(uuid, text) TO authenticated;

-- ===========================================================================
-- 5. Structured Student Messages across Booking, Evaluation Result & Certification Approval
-- ===========================================================================
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
  v_student_name text;
  v_interviewer_name text;
  v_badge_name text;
  v_track_name text;
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

  SELECT full_name INTO v_student_name
  FROM public.profiles
  WHERE id = auth.uid() AND is_active = true;

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

  SELECT ip.full_name
  INTO v_interviewer_name
  FROM public.interviewers iv
  JOIN public.profiles ip ON ip.id = iv.user_id
  WHERE iv.id = p_interviewer_id
    AND iv.is_active
  FOR KEY SHARE OF iv;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'interviewer_unavailable' USING errcode = '23514';
  END IF;

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

  SELECT b.name, t.name
  INTO v_badge_name, v_track_name
  FROM public.badges b
  JOIN public.tracks t ON t.id = b.track_id
  WHERE b.id = p_badge_id AND b.is_active = true;

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

  INSERT INTO public.notifications (user_id, type, template_key, delivery_channel, delivery_status, sent_at, payload)
  VALUES (
    auth.uid(),
    'BOOKING_CONFIRMATION',
    'booking_confirmation',
    'IN_APP',
    'DELIVERED',
    now(),
    jsonb_build_object(
      'interview_id', v_interview.id,
      'booking_reference', v_interview.booking_reference,
      'badge_id', v_interview.badge_id,
      'badge_name', v_badge_name,
      'track_name', v_track_name,
      'student_name', v_student_name,
      'interviewer_name', coalesce(v_interviewer_name, 'Assigned Interviewer'),
      'starts_at', v_interview.starts_at,
      'ends_at', v_interview.ends_at,
      'timezone', v_interview.timezone
    )
  );

  INSERT INTO public.integration_outbox (event_type, aggregate_type, aggregate_id, payload)
  VALUES (
    'interview.booked',
    'interview',
    v_interview.id,
    jsonb_build_object('interview_id', v_interview.id, 'booking_reference', v_interview.booking_reference)
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

CREATE OR REPLACE FUNCTION public.submit_interview_result(
  p_interview_id uuid,
  p_outcome public.evaluation_outcome,
  p_feedback text,
  p_retake_after timestamptz,
  p_idempotency_key text
)
RETURNS public.interview_results
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_interviewer uuid;
  v_interview public.interviews;
  v_existing public.interview_results;
  v_result public.interview_results;
  v_student_user_id uuid;
  v_student_name text;
  v_badge_name text;
  v_track_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING errcode = '28000';
  END IF;

  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key_required' USING errcode = '22023';
  END IF;

  IF p_outcome IS null THEN
    RAISE EXCEPTION 'outcome_required' USING errcode = '22023';
  END IF;

  IF p_outcome = 'RETAKE_LATER' AND p_retake_after IS NULL THEN
    RAISE EXCEPTION 'retake_after_required' USING errcode = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(auth.uid()::text || ':' || p_idempotency_key)
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
  ) THEN
    RAISE EXCEPTION 'profile_inactive' USING errcode = '42501';
  END IF;

  SELECT i.id
  INTO v_interviewer
  FROM public.interviewers i
  WHERE i.user_id = auth.uid()
    AND i.is_active = true;

  IF v_interviewer IS NULL THEN
    RAISE EXCEPTION 'interviewer_role_required' USING errcode = '42501';
  END IF;

  SELECT *
  INTO v_interview
  FROM public.interviews
  WHERE id = p_interview_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'interview_not_found' USING errcode = 'P0002';
  END IF;

  IF v_interview.interviewer_id <> v_interviewer THEN
    RAISE EXCEPTION 'not_assigned_interviewer' USING errcode = '42501';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.interview_results
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.interview_id <> p_interview_id
       OR v_existing.outcome IS DISTINCT FROM p_outcome
       OR v_existing.feedback IS DISTINCT FROM p_feedback
       OR v_existing.retake_after IS DISTINCT FROM p_retake_after THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING errcode = '22023';
    END IF;

    RETURN v_existing;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.interview_results
    WHERE interview_id = p_interview_id
  ) THEN
    RAISE EXCEPTION 'evaluation_exists' USING errcode = '23505';
  END IF;

  IF v_interview.status NOT IN ('IN_PROGRESS', 'AWAITING_OUTCOME') THEN
    RAISE EXCEPTION 'invalid_interview_status' USING errcode = '23514';
  END IF;

  INSERT INTO public.interview_results (
    interview_id,
    outcome,
    feedback,
    evaluator_id,
    retake_after,
    idempotency_key
  )
  VALUES (
    p_interview_id,
    p_outcome,
    p_feedback,
    auth.uid(),
    p_retake_after,
    p_idempotency_key
  )
  RETURNING * INTO v_result;

  UPDATE public.interviews
  SET status = 'EVALUATED',
      updated_at = now()
  WHERE id = p_interview_id;

  IF p_outcome = 'PASS' THEN
    INSERT INTO public.badge_awards (
      student_id,
      badge_id,
      interview_result_id,
      status
    )
    VALUES (
      v_interview.student_id,
      v_interview.badge_id,
      v_result.id,
      'CERTIFICATION_PENDING'
    );

    INSERT INTO public.integration_outbox (
      event_type,
      aggregate_type,
      aggregate_id,
      payload
    )
    VALUES (
      'badge.certification.requested',
      'interview_result',
      v_result.id,
      jsonb_build_object(
        'interview_id', p_interview_id,
        'result_id', v_result.id
      )
    );
  END IF;

  SELECT s.user_id, sp.full_name
  INTO v_student_user_id, v_student_name
  FROM public.students s
  JOIN public.profiles sp ON sp.id = s.user_id
  WHERE s.id = v_interview.student_id;

  SELECT b.name, t.name
  INTO v_badge_name, v_track_name
  FROM public.badges b
  JOIN public.tracks t ON t.id = b.track_id
  WHERE b.id = v_interview.badge_id;

  IF v_student_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id,
      type,
      template_key,
      delivery_channel,
      delivery_status,
      sent_at,
      payload
    )
    VALUES (
      v_student_user_id,
      'INTERVIEW_RESULT_PUBLISHED',
      'interview_result_published',
      'IN_APP',
      'DELIVERED',
      now(),
      jsonb_build_object(
        'interview_id', p_interview_id,
        'result_id', v_result.id,
        'badge_id', v_interview.badge_id,
        'badge_name', v_badge_name,
        'track_name', v_track_name,
        'student_name', v_student_name,
        'outcome', p_outcome,
        'feedback', p_feedback,
        'retake_after', p_retake_after,
        'certification_status', CASE WHEN p_outcome = 'PASS' THEN 'CERTIFICATION_PENDING' ELSE NULL END
      )
    );

    INSERT INTO public.integration_outbox (
      event_type,
      aggregate_type,
      aggregate_id,
      payload
    )
    VALUES (
      'interview.result.published',
      'interview_result',
      v_result.id,
      jsonb_build_object(
        'interview_id', p_interview_id,
        'result_id', v_result.id,
        'outcome', p_outcome
      )
    );
  END IF;

  INSERT INTO public.audit_logs (
    actor_id,
    entity_type,
    entity_id,
    action,
    new_value
  )
  VALUES (
    auth.uid(),
    'interview_result',
    v_result.id,
    'SUBMITTED',
    to_jsonb(v_result)
  );

  RETURN v_result;

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'evaluation_conflict' USING errcode = '23505';
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_badge_certification(
  p_badge_award_id uuid,
  p_idempotency_key text
)
RETURNS public.badge_awards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_award public.badge_awards;
  v_award_before public.badge_awards;
  v_existing public.idempotency_records;
  v_request_payload jsonb;
  v_student_user_id uuid;
  v_student_name text;
  v_badge_name text;
  v_track_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING errcode = '28000';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING errcode = '22023';
  END IF;

  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'staff_role_required' USING errcode = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(auth.uid()::text || ':' || p_idempotency_key));

  v_request_payload := jsonb_build_object(
    'badge_award_id', p_badge_award_id
  );

  SELECT * INTO v_existing FROM public.idempotency_records
  WHERE actor_id = auth.uid() AND operation = 'approve_badge_certification' AND key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.request_payload IS DISTINCT FROM v_request_payload THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING errcode = 'P0001';
    END IF;
    SELECT * INTO v_award FROM public.badge_awards where id = (v_existing.response->>'badge_award_id')::uuid;
    RETURN v_award;
  END IF;

  SELECT * INTO v_award FROM public.badge_awards WHERE id = p_badge_award_id FOR UPDATE OF badge_awards;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'badge_award_not_found' USING errcode = 'P0002';
  END IF;

  IF v_award.status IS DISTINCT FROM 'CERTIFICATION_PENDING' THEN
    RAISE EXCEPTION 'badge_award_not_pending' USING errcode = '23514';
  END IF;

  v_award_before := v_award;

  UPDATE public.badge_awards
  SET status = 'AWARDED',
      awarded_at = now()
  WHERE id = v_award.id
  RETURNING * INTO v_award;

  INSERT INTO public.idempotency_records(actor_id, operation, key, response, request_payload)
  VALUES (auth.uid(), 'approve_badge_certification', p_idempotency_key,
    jsonb_build_object('badge_award_id', v_award.id), v_request_payload);

  SELECT s.user_id, sp.full_name
  INTO v_student_user_id, v_student_name
  FROM public.students s
  JOIN public.profiles sp ON sp.id = s.user_id
  WHERE s.id = v_award.student_id;

  SELECT b.name, t.name
  INTO v_badge_name, v_track_name
  FROM public.badges b
  JOIN public.tracks t ON t.id = b.track_id
  WHERE b.id = v_award.badge_id;

  IF v_student_user_id IS NOT NULL THEN
    INSERT INTO public.notifications(
      user_id,
      type,
      template_key,
      delivery_channel,
      delivery_status,
      sent_at,
      payload
    )
    VALUES (
      v_student_user_id,
      'CERTIFICATION_AWARDED',
      'certification_awarded',
      'IN_APP',
      'DELIVERED',
      now(),
      jsonb_build_object(
        'badge_award_id', v_award.id,
        'badge_id', v_award.badge_id,
        'badge_name', v_badge_name,
        'track_name', v_track_name,
        'student_name', v_student_name,
        'awarded_at', v_award.awarded_at
      )
    );
  END IF;

  INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, previous_value, new_value, reason)
  VALUES (auth.uid(), 'badge_award', v_award.id, 'APPROVED', to_jsonb(v_award_before), to_jsonb(v_award),
    'Badge certification approved');

  INSERT INTO public.integration_outbox(event_type, aggregate_type, aggregate_id, payload)
  VALUES ('badge.certification.awarded', 'badge_award', v_award.id,
    jsonb_build_object('badge_award_id', v_award.id, 'student_id', v_award.student_id,
      'badge_id', v_award.badge_id, 'interview_result_id', v_award.interview_result_id));

  RETURN v_award;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_student_notification_read(
  p_notification_id uuid
)
RETURNS public.notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.notifications;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING errcode = '28000';
  END IF;

  UPDATE public.notifications
  SET read_at = coalesce(read_at, now())
  WHERE id = p_notification_id
    AND user_id = auth.uid()
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'notification_not_found' USING errcode = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_student_notification_read(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_student_notification_read(uuid) TO authenticated;
