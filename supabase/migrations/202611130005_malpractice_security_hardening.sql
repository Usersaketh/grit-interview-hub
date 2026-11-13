-- Malpractice security hardening (corrective migration)
-- Revokes all direct table access on malpractice_reports and badge_awards from
-- PUBLIC, authenticated, and anon. Adds partial unique index over all unresolved
-- statuses. Adds sanitized security-definer read RPCs. No existing tables modified.

-- ===========================================================================
-- Revoke direct table access: RLS is row-level, not column-level. PUBLIC,
-- authenticated, and anon users must never read sensitive columns directly
-- (evidence_reference, reviewer_notes, reported_by, description).
-- ===========================================================================
revoke select on table public.malpractice_reports from public;
revoke select on table public.malpractice_reports from authenticated;
revoke select on table public.malpractice_reports from anon;
revoke select on table public.badge_awards from public;
revoke select on table public.badge_awards from authenticated;
revoke select on table public.badge_awards from anon;

-- Revoke any column-level grants that might exist on sensitive columns,
-- from PUBLIC, authenticated, and anon to account for existing ACLs.
revoke select (evidence_reference, reviewer_notes, reported_by, description)
  on table public.malpractice_reports from public;
revoke select (evidence_reference, reviewer_notes, reported_by, description)
  on table public.malpractice_reports from authenticated;
revoke select (evidence_reference, reviewer_notes, reported_by, description)
  on table public.malpractice_reports from anon;

-- ===========================================================================
-- Partial unique index: one unresolved case per student+badge across all
-- unresolved statuses. DISMISSED and REINSTATED cases do not block future reports.
-- ===========================================================================
create unique index if not exists malpractice_reports_one_outstanding_per_student_badge
  on public.malpractice_reports(student_id, badge_id)
  where status in ('REPORTED', 'UNDER_REVIEW', 'CONFIRMED', 'APPEALED');

-- ===========================================================================
-- Staff malpractice queue (security-definer).
-- Bypasses RLS; authorization enforced by is_staff() and API requireRole.
-- All columns qualified with table alias to avoid PL/pgSQL output ambiguity.
-- ===========================================================================
create or replace function public.malpractice_queue()
returns table (
  id uuid,
  student_id uuid,
  badge_id uuid,
  reported_by uuid,
  reason_code text,
  description text,
  evidence_reference text,
  status public.malpractice_status,
  reviewed_by uuid,
  reviewed_at timestamptz,
  reviewer_notes text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  if not public.is_staff() then
    raise exception 'staff_role_required' using errcode = '42501';
  end if;

  return query
  select
    mr.id, mr.student_id, mr.badge_id, mr.reported_by, mr.reason_code,
    mr.description, mr.evidence_reference, mr.status, mr.reviewed_by,
    mr.reviewed_at, mr.reviewer_notes, mr.created_at
  from public.malpractice_reports mr
  order by mr.created_at desc;
end;
$$;

-- ===========================================================================
-- Student malpractice status (security-definer).
-- Derives student exclusively from auth.uid(); never accepts a caller-supplied
-- student ID. Returns only sanitized fields. Wraps the UNION ALL in a subquery
-- and applies COALESCE ordering in the outer SELECT so PostgreSQL accepts the
-- query. Uses UNION ALL (not a join) to avoid duplicate/multiplicative rows
-- when a student has multiple awards or reports for the same badge. No implied
-- report-to-award relationship.
-- ===========================================================================
create or replace function public.student_malpractice_status()
returns table (
  record_type text,
  badge_id uuid,
  award_id uuid,
  award_status public.certification_status,
  awarded_at timestamptz,
  nullified_at timestamptz,
  reinstated_at timestamptz,
  report_id uuid,
  report_status public.malpractice_status,
  report_created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select id into v_student_id from public.students where user_id = auth.uid();
  if v_student_id is null then
    raise exception 'student_role_required' using errcode = '42501';
  end if;

  return query
  select *
  from (
    -- Badge awards for this student (sanitized, no sensitive fields).
    select
      'badge_award'::text as record_type,
      ba.badge_id,
      ba.id as award_id,
      ba.status as award_status,
      ba.awarded_at,
      ba.nullified_at,
      ba.reinstated_at,
      null::uuid as report_id,
      null::public.malpractice_status as report_status,
      null::timestamptz as report_created_at
    from public.badge_awards ba
    where ba.student_id = v_student_id

    union all

    -- Malpractice reports for this student (sanitized; no evidence, notes, or reporter).
    select
      'malpractice_report'::text as record_type,
      mr.badge_id,
      null::uuid as award_id,
      null::public.certification_status as award_status,
      null::timestamptz as awarded_at,
      null::timestamptz as nullified_at,
      null::timestamptz as reinstated_at,
      mr.id as report_id,
      mr.status as report_status,
      mr.created_at as report_created_at
    from public.malpractice_reports mr
    where mr.student_id = v_student_id
  ) as combined
  order by coalesce(
    combined.awarded_at,
    combined.report_created_at
  ) desc;
end;
$$;

-- ===========================================================================
-- Function permissions for read RPCs: revoke from PUBLIC and anon, grant to
-- authenticated.
-- ===========================================================================
revoke execute on function public.malpractice_queue() from public;
revoke execute on function public.malpractice_queue() from authenticated;
revoke execute on function public.malpractice_queue() from anon;
revoke execute on function public.student_malpractice_status() from public;
revoke execute on function public.student_malpractice_status() from authenticated;
revoke execute on function public.student_malpractice_status() from anon;

grant execute on function public.malpractice_queue() to authenticated;
grant execute on function public.student_malpractice_status() to authenticated;
