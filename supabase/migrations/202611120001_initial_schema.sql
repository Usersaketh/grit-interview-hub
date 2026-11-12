-- GRIT Interview Hub: authoritative scheduling and evaluation data.
create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

create type public.app_role as enum ('STUDENT', 'INTERVIEWER', 'OPERATIONS', 'ADMIN');
create type public.booking_status as enum ('BOOKED', 'RESCHEDULE_PENDING', 'CANCELLED', 'INTERVIEWER_CANCELLED', 'IN_PROGRESS', 'AWAITING_OUTCOME', 'EVALUATED', 'NO_SHOW');
create type public.attendance_status as enum ('NOT_RECORDED', 'ATTENDED', 'STUDENT_NO_SHOW', 'INTERVIEWER_NO_SHOW', 'BOTH_ABSENT');
create type public.evaluation_outcome as enum ('PASS', 'FAIL', 'RETAKE_LATER');
create type public.certification_status as enum ('LOCKED', 'ELIGIBLE_FOR_INTERVIEW', 'CERTIFICATION_PENDING', 'AWARDED', 'NULLIFICATION_UNDER_REVIEW', 'NULLIFIED', 'REINSTATED');
create type public.malpractice_status as enum ('REPORTED', 'UNDER_REVIEW', 'DISMISSED', 'CONFIRMED', 'APPEALED', 'REINSTATED');
create type public.availability_kind as enum ('AVAILABLE', 'UNAVAILABLE');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  external_user_id text unique, full_name text not null, email text not null unique,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_roles (user_id uuid not null references public.profiles(id) on delete cascade, role public.app_role not null, assigned_by uuid references public.profiles(id), created_at timestamptz not null default now(), primary key(user_id, role));
create table public.students (id uuid primary key default gen_random_uuid(), user_id uuid not null unique references public.profiles(id), external_student_id text not null unique, campus_ref text, created_at timestamptz not null default now());
create table public.interviewers (id uuid primary key default gen_random_uuid(), user_id uuid not null unique references public.profiles(id), is_active boolean not null default true, default_timezone text not null default 'Asia/Kolkata', created_at timestamptz not null default now());
create table public.tracks (id uuid primary key default gen_random_uuid(), external_id text unique, name text not null, is_active boolean not null default true);
create table public.badges (id uuid primary key default gen_random_uuid(), track_id uuid not null references public.tracks(id), external_id text unique, name text not null, level text not null, is_active boolean not null default true);
create table public.skills (id uuid primary key default gen_random_uuid(), external_id text unique, name text not null);
create table public.badge_required_skills (badge_id uuid not null references public.badges(id) on delete cascade, skill_id uuid not null references public.skills(id), required_level integer not null check(required_level > 0), primary key(badge_id, skill_id));
create table public.skill_progress (id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students(id), skill_id uuid not null references public.skills(id), achieved_level integer not null check(achieved_level >= 0), verified_at timestamptz, source_updated_at timestamptz not null, source_version text, unique(student_id, skill_id));

create table public.interviewer_availability (
  id uuid primary key default gen_random_uuid(), interviewer_id uuid not null references public.interviewers(id) on delete cascade,
  day_of_week smallint not null check(day_of_week between 0 and 6), start_time time not null, end_time time not null, timezone text not null,
  effective_from date not null default current_date, effective_until date, is_active boolean not null default true, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(end_time > start_time), check(effective_until is null or effective_until >= effective_from)
);
create table public.availability_overrides (
  id uuid primary key default gen_random_uuid(), interviewer_id uuid not null references public.interviewers(id) on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null, kind public.availability_kind not null, reason text, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), check(ends_at > starts_at)
);

create table public.interviews (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students(id), badge_id uuid not null references public.badges(id), interviewer_id uuid not null references public.interviewers(id),
  starts_at timestamptz not null, ends_at timestamptz not null, timezone text not null, status public.booking_status not null default 'BOOKED', booking_reference text not null unique default ('INT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))), attempt_number integer not null check(attempt_number > 0), created_by uuid not null references public.profiles(id), cancelled_at timestamptz, cancellation_reason text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(ends_at > starts_at)
);
create unique index interviews_one_active_student_badge on public.interviews(student_id, badge_id) where status in ('BOOKED', 'RESCHEDULE_PENDING', 'IN_PROGRESS', 'AWAITING_OUTCOME');
alter table public.interviews add constraint interviews_no_interviewer_overlap exclude using gist (interviewer_id with =, tstzrange(starts_at, ends_at, '[)') with &&) where (status in ('BOOKED', 'RESCHEDULE_PENDING', 'IN_PROGRESS', 'AWAITING_OUTCOME'));
create index interviews_student_idx on public.interviews(student_id, starts_at desc); create index interviews_interviewer_idx on public.interviews(interviewer_id, starts_at);
create table public.interview_reschedule_history (id uuid primary key default gen_random_uuid(), interview_id uuid not null references public.interviews(id), old_starts_at timestamptz not null, old_ends_at timestamptz not null, new_starts_at timestamptz not null, new_ends_at timestamptz not null, requested_by uuid not null references public.profiles(id), reason text not null, created_at timestamptz not null default now());
create table public.interview_attendance (interview_id uuid primary key references public.interviews(id) on delete cascade, student_attendance public.attendance_status not null default 'NOT_RECORDED', interviewer_attendance public.attendance_status not null default 'NOT_RECORDED', marked_by uuid not null references public.profiles(id), marked_at timestamptz not null default now(), notes text);
create table public.interview_results (id uuid primary key default gen_random_uuid(), interview_id uuid not null unique references public.interviews(id), outcome public.evaluation_outcome not null, feedback text, evaluator_id uuid not null references public.profiles(id), submitted_at timestamptz not null default now(), retake_after timestamptz, visibility_status text not null default 'PUBLISHED', idempotency_key text not null unique, check((outcome <> 'RETAKE_LATER') or retake_after is not null));
create table public.badge_awards (id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students(id), badge_id uuid not null references public.badges(id), interview_result_id uuid unique references public.interview_results(id), external_award_id text unique, status public.certification_status not null default 'CERTIFICATION_PENDING', awarded_at timestamptz, nullified_at timestamptz, reinstated_at timestamptz, created_at timestamptz not null default now());
create table public.malpractice_reports (id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students(id), badge_id uuid not null references public.badges(id), reported_by uuid not null references public.profiles(id), reason_code text not null, description text not null, evidence_reference text, status public.malpractice_status not null default 'REPORTED', reviewed_by uuid references public.profiles(id), reviewed_at timestamptz, reviewer_notes text, created_at timestamptz not null default now());
create table public.badge_reinstatements (id uuid primary key default gen_random_uuid(), badge_award_id uuid not null references public.badge_awards(id), malpractice_report_id uuid not null references public.malpractice_reports(id), reason text not null, approved_by uuid not null references public.profiles(id), reinstated_at timestamptz not null default now());
create table public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), type text not null, template_key text not null, payload jsonb not null default '{}'::jsonb, delivery_channel text not null default 'IN_APP', delivery_status text not null default 'PENDING', attempt_count integer not null default 0, last_error text, created_at timestamptz not null default now(), sent_at timestamptz, read_at timestamptz);
create table public.audit_logs (id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id), entity_type text not null, entity_id uuid not null, action text not null, previous_value jsonb, new_value jsonb, reason text, created_at timestamptz not null default now());
create table public.idempotency_records (id uuid primary key default gen_random_uuid(), actor_id uuid not null references public.profiles(id), operation text not null, key text not null, response jsonb not null, created_at timestamptz not null default now(), unique(actor_id, operation, key));
create table public.integration_outbox (id uuid primary key default gen_random_uuid(), event_type text not null, aggregate_type text not null, aggregate_id uuid not null, payload jsonb not null, status text not null default 'PENDING', attempt_count integer not null default 0, next_attempt_at timestamptz not null default now(), published_at timestamptz, created_at timestamptz not null default now());

create or replace function public.has_role(required_role public.app_role) returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.user_roles where user_id = auth.uid() and role = required_role); $$;
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path = '' as $$ select public.has_role('OPERATIONS') or public.has_role('ADMIN'); $$;
create or replace function public.current_student_id() returns uuid language sql stable security definer set search_path = '' as $$ select id from public.students where user_id = auth.uid(); $$;
create or replace function public.current_interviewer_id() returns uuid language sql stable security definer set search_path = '' as $$ select id from public.interviewers where user_id = auth.uid(); $$;

-- Single transaction: locks chosen availability and derives eligibility from verified local GRIT read model.
create or replace function public.book_interview(p_badge_id uuid, p_interviewer_id uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_timezone text, p_idempotency_key text)
returns public.interviews language plpgsql security definer set search_path = '' as $$
declare v_student uuid; v_existing public.interviews; v_attempt integer; v_interview public.interviews;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  -- Serializes retries for the same actor/key before the idempotency lookup.
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text || p_idempotency_key));
  select id into v_student from public.students where user_id = auth.uid(); if v_student is null then raise exception 'student_role_required' using errcode = '42501'; end if;
  select i.* into v_existing from public.interviews i join public.idempotency_records r on r.actor_id=auth.uid() and r.operation='book_interview' and r.key=p_idempotency_key where (r.response->>'interview_id')::uuid=i.id;
  if found then return v_existing; end if;
  if p_ends_at <= p_starts_at or p_starts_at <= now() then raise exception 'invalid_time_range' using errcode='22023'; end if;
  perform 1 from public.interviewers where id=p_interviewer_id and is_active for key share; if not found then raise exception 'interviewer_unavailable' using errcode='23514'; end if;
  perform 1 from public.interviewer_availability a where a.interviewer_id=p_interviewer_id and a.is_active and extract(dow from p_starts_at at time zone a.timezone)=a.day_of_week and (p_starts_at at time zone a.timezone)::time >= a.start_time and (p_ends_at at time zone a.timezone)::time <= a.end_time and (p_starts_at at time zone a.timezone)::date >= a.effective_from and (a.effective_until is null or (p_starts_at at time zone a.timezone)::date <= a.effective_until) for key share;
  if not found then raise exception 'outside_availability' using errcode='23514'; end if;
  if exists(select 1 from public.availability_overrides o where o.interviewer_id=p_interviewer_id and o.kind='UNAVAILABLE' and tstzrange(o.starts_at,o.ends_at,'[)') && tstzrange(p_starts_at,p_ends_at,'[)')) then raise exception 'availability_override_conflict' using errcode='23514'; end if;
  if exists(select 1 from public.badge_required_skills r left join public.skill_progress sp on sp.student_id=v_student and sp.skill_id=r.skill_id where r.badge_id=p_badge_id and (sp.verified_at is null or sp.achieved_level < r.required_level)) then raise exception 'not_eligible' using errcode='23514'; end if;
  select coalesce(max(attempt_number),0)+1 into v_attempt from public.interviews where student_id=v_student and badge_id=p_badge_id;
  insert into public.interviews(student_id,badge_id,interviewer_id,starts_at,ends_at,timezone,attempt_number,created_by) values(v_student,p_badge_id,p_interviewer_id,p_starts_at,p_ends_at,p_timezone,v_attempt,auth.uid()) returning * into v_interview;
  insert into public.idempotency_records(actor_id,operation,key,response) values(auth.uid(),'book_interview',p_idempotency_key,jsonb_build_object('interview_id',v_interview.id));
  insert into public.notifications(user_id,type,template_key,payload) select auth.uid(),'BOOKING_CONFIRMATION','booking_confirmation',jsonb_build_object('interview_id',v_interview.id);
  insert into public.integration_outbox(event_type,aggregate_type,aggregate_id,payload) values('interview.booked','interview',v_interview.id,jsonb_build_object('interview_id',v_interview.id));
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,new_value) values(auth.uid(),'interview',v_interview.id,'BOOKED',to_jsonb(v_interview)); return v_interview;
exception when unique_violation or exclusion_violation then raise exception 'booking_conflict' using errcode='23505'; end; $$;

-- Evaluation is a separate atomic command. A PASS creates only a pending certification request, never an award.
create or replace function public.submit_interview_result(p_interview_id uuid, p_outcome public.evaluation_outcome, p_feedback text, p_retake_after timestamptz, p_idempotency_key text)
returns public.interview_results language plpgsql security definer set search_path = '' as $$
declare v_interviewer uuid; v_interview public.interviews; v_existing public.interview_results; v_result public.interview_results;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if p_outcome = 'RETAKE_LATER' and p_retake_after is null then raise exception 'retake_after_required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text || p_idempotency_key));
  select id into v_interviewer from public.interviewers where user_id = auth.uid() and is_active;
  if v_interviewer is null then raise exception 'interviewer_role_required' using errcode = '42501'; end if;
  select * into v_interview from public.interviews where id = p_interview_id for update;
  if not found then raise exception 'interview_not_found' using errcode = 'P0002'; end if;
  if v_interview.interviewer_id <> v_interviewer then raise exception 'not_assigned_interviewer' using errcode = '42501'; end if;
  select * into v_existing from public.interview_results where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.interview_id <> p_interview_id then raise exception 'idempotency_key_reused' using errcode = '23505'; end if;
    return v_existing;
  end if;
  if exists(select 1 from public.interview_results where interview_id = p_interview_id) then raise exception 'evaluation_exists' using errcode = '23505'; end if;
  if v_interview.status not in ('IN_PROGRESS', 'AWAITING_OUTCOME') then raise exception 'invalid_interview_status' using errcode = '23514'; end if;
  insert into public.interview_results(interview_id,outcome,feedback,evaluator_id,retake_after,idempotency_key) values(p_interview_id,p_outcome,p_feedback,auth.uid(),p_retake_after,p_idempotency_key) returning * into v_result;
  update public.interviews set status='EVALUATED', updated_at=now() where id=p_interview_id;
  if p_outcome = 'PASS' then
    insert into public.badge_awards(student_id,badge_id,interview_result_id,status) values(v_interview.student_id,v_interview.badge_id,v_result.id,'CERTIFICATION_PENDING');
    insert into public.integration_outbox(event_type,aggregate_type,aggregate_id,payload) values('badge.certification.requested','interview_result',v_result.id,jsonb_build_object('interview_id',p_interview_id,'result_id',v_result.id));
  end if;
  insert into public.audit_logs(actor_id,entity_type,entity_id,action,new_value) values(auth.uid(),'interview_result',v_result.id,'SUBMITTED',to_jsonb(v_result));
  return v_result;
exception when unique_violation then
  raise exception 'evaluation_conflict' using errcode = '23505';
end; $$;

create or replace function public.handle_new_auth_user() returns trigger language plpgsql security definer set search_path = '' as $$ begin insert into public.profiles(id, full_name, email) values(new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), new.email); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_auth_user();

alter table public.profiles enable row level security; alter table public.user_roles enable row level security; alter table public.students enable row level security; alter table public.interviewers enable row level security; alter table public.tracks enable row level security; alter table public.badges enable row level security; alter table public.skills enable row level security; alter table public.badge_required_skills enable row level security; alter table public.skill_progress enable row level security; alter table public.interviewer_availability enable row level security; alter table public.availability_overrides enable row level security; alter table public.interviews enable row level security; alter table public.interview_reschedule_history enable row level security; alter table public.interview_attendance enable row level security; alter table public.interview_results enable row level security; alter table public.badge_awards enable row level security; alter table public.malpractice_reports enable row level security; alter table public.badge_reinstatements enable row level security; alter table public.notifications enable row level security; alter table public.audit_logs enable row level security; alter table public.idempotency_records enable row level security; alter table public.integration_outbox enable row level security;
create policy "profile self or staff" on public.profiles for select using (id=auth.uid() or public.is_staff()); create policy "own student" on public.students for select using (user_id=auth.uid() or public.is_staff()); create policy "reference data readable" on public.tracks for select using (auth.uid() is not null); create policy "badge readable" on public.badges for select using (auth.uid() is not null); create policy "skills readable" on public.skills for select using (auth.uid() is not null); create policy "requirements readable" on public.badge_required_skills for select using (auth.uid() is not null); create policy "own progress" on public.skill_progress for select using (student_id=public.current_student_id() or public.is_staff());
create policy "roles self readable" on public.user_roles for select using (user_id=auth.uid() or public.has_role('ADMIN'));
create policy "interviewer self or staff" on public.interviewers for select using (user_id=auth.uid() or public.is_staff());
create policy "interviewer manages availability" on public.interviewer_availability for all using (interviewer_id=public.current_interviewer_id() or public.is_staff()) with check (interviewer_id=public.current_interviewer_id() or public.is_staff());
create policy "interviewer manages own overrides" on public.availability_overrides for all using (interviewer_id=public.current_interviewer_id() or public.is_staff()) with check (interviewer_id=public.current_interviewer_id() or public.is_staff());
create policy "interviews scoped" on public.interviews for select using (student_id=public.current_student_id() or interviewer_id=public.current_interviewer_id() or public.is_staff()); create policy "staff or assigned interviewer updates" on public.interviews for update using (interviewer_id=public.current_interviewer_id() or public.is_staff()); create policy "attendance scoped" on public.interview_attendance for select using (exists(select 1 from public.interviews i where i.id=interview_id and (i.student_id=public.current_student_id() or i.interviewer_id=public.current_interviewer_id() or public.is_staff()))); create policy "assigned interviewer or staff records attendance" on public.interview_attendance for insert with check (marked_by=auth.uid() and exists(select 1 from public.interviews i where i.id=interview_id and (i.interviewer_id=public.current_interviewer_id() or public.is_staff()))); create policy "assigned interviewer or staff updates attendance" on public.interview_attendance for update using (exists(select 1 from public.interviews i where i.id=interview_id and (i.interviewer_id=public.current_interviewer_id() or public.is_staff()))) with check (marked_by=auth.uid()); create policy "results scoped" on public.interview_results for select using (exists(select 1 from public.interviews i where i.id=interview_id and (i.student_id=public.current_student_id() or i.interviewer_id=public.current_interviewer_id() or public.is_staff()))); create policy "awards scoped" on public.badge_awards for select using (student_id=public.current_student_id() or public.is_staff()); create policy "reschedule history scoped" on public.interview_reschedule_history for select using (exists(select 1 from public.interviews i where i.id=interview_id and (i.student_id=public.current_student_id() or i.interviewer_id=public.current_interviewer_id() or public.is_staff()))); create policy "reinstatements staff only" on public.badge_reinstatements for select using (public.is_staff()); create policy "notifications own" on public.notifications for select using (user_id=auth.uid() or public.is_staff()); create policy "audit staff" on public.audit_logs for select using (public.is_staff());
revoke all on function public.has_role(public.app_role) from public; revoke all on function public.is_staff() from public; revoke all on function public.current_student_id() from public; revoke all on function public.current_interviewer_id() from public; revoke all on function public.book_interview(uuid,uuid,timestamptz,timestamptz,text,text) from public; revoke all on function public.submit_interview_result(uuid,public.evaluation_outcome,text,timestamptz,text) from public; revoke all on function public.handle_new_auth_user() from public;
grant execute on function public.has_role(public.app_role) to authenticated; grant execute on function public.is_staff() to authenticated; grant execute on function public.current_student_id() to authenticated; grant execute on function public.current_interviewer_id() to authenticated; grant execute on function public.book_interview(uuid,uuid,timestamptz,timestamptz,text,text) to authenticated; grant execute on function public.submit_interview_result(uuid,public.evaluation_outcome,text,timestamptz,text) to authenticated;
