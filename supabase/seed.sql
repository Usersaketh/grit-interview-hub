-- Development-only fictional records. Run after `supabase start`; passwords are demo-only.
-- Supabase Auth identities are deliberately created with deterministic UUIDs for repeatable local data.
-- `managed_provision: "true"` allows deterministic role seeding for staff/interviewer demo users.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000000','authenticated','authenticated','student.eligible@example.test',crypt('DemoPassword123!',gen_salt('bf')),now(),'{"provider":"email","providers":["email"],"managed_provision":"true"}','{"full_name":"Aarav Sharma"}',now(),now()),
 ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000000','authenticated','authenticated','student.ineligible@example.test',crypt('DemoPassword123!',gen_salt('bf')),now(),'{"provider":"email","providers":["email"],"managed_provision":"true"}','{"full_name":"Diya Patel"}',now(),now()),
 ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000000','authenticated','authenticated','interviewer@example.test',crypt('DemoPassword123!',gen_salt('bf')),now(),'{"provider":"email","providers":["email"],"managed_provision":"true"}','{"full_name":"Ananya Rao"}',now(),now()),
 ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000000','authenticated','authenticated','operations@example.test',crypt('DemoPassword123!',gen_salt('bf')),now(),'{"provider":"email","providers":["email"],"managed_provision":"true"}','{"full_name":"Kiran Mehta"}',now(),now()),
 ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000000','authenticated','authenticated','admin@example.test',crypt('DemoPassword123!',gen_salt('bf')),now(),'{"provider":"email","providers":["email"],"managed_provision":"true"}','{"full_name":"System Admin"}',now(),now())
on conflict (id) do nothing;

insert into public.user_roles(user_id,role)
values
 ('00000000-0000-4000-8000-000000000001','STUDENT'),
 ('00000000-0000-4000-8000-000000000002','STUDENT'),
 ('00000000-0000-4000-8000-000000000003','INTERVIEWER'),
 ('00000000-0000-4000-8000-000000000004','OPERATIONS'),
 ('00000000-0000-4000-8000-000000000005','ADMIN')
on conflict (user_id, role) do nothing;

insert into public.students(id,user_id,external_student_id,campus_ref)
values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','DEMO-STU-001','Hyderabad'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','DEMO-STU-002','Bengaluru')
on conflict (user_id) do nothing;

insert into public.interviewers(id,user_id,default_timezone,title,bio,expertise_tags)
values
 ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','Asia/Kolkata','Principal Full Stack Assessor','Leads technical capability evaluations across Full Stack Foundations, JavaScript runtime internals, and relational data modeling.',array['Full Stack Development','JavaScript','PostgreSQL'])
on conflict (user_id) do nothing;

insert into public.tracks(id,external_id,name)
values ('30000000-0000-4000-8000-000000000001','DEMO-FSD','Full Stack Development')
on conflict (id) do nothing;

insert into public.badges(id,track_id,external_id,name,level)
values ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','DEMO-FSD-L1','Full Stack Foundations','Level 1')
on conflict (id) do nothing;

insert into public.skills(id,external_id,name)
values
 ('50000000-0000-4000-8000-000000000001','DEMO-JS','JavaScript'),
 ('50000000-0000-4000-8000-000000000002','DEMO-DB','Databases')
on conflict (id) do nothing;

insert into public.badge_required_skills
values
 ('40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',1),
 ('40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',1)
on conflict (badge_id, skill_id) do nothing;

insert into public.skill_progress(student_id,skill_id,achieved_level,verified_at,source_updated_at)
values
 ('10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',1,now(),now()),
 ('10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',1,now(),now()),
 ('10000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001',1,now(),now())
on conflict (student_id, skill_id) do nothing;

insert into public.interviewer_availability(interviewer_id,day_of_week,start_time,end_time,timezone,effective_from,created_by)
select '20000000-0000-4000-8000-000000000001', d, '09:00','17:00','Asia/Kolkata',current_date,'00000000-0000-4000-8000-000000000003'
from generate_series(1,5) d
where not exists (
  select 1 from public.interviewer_availability ia
  where ia.interviewer_id = '20000000-0000-4000-8000-000000000001'
    and ia.day_of_week = d
);
