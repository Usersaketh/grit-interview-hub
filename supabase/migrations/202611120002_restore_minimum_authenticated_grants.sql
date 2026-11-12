
-- Restore only the table privileges required by the current API architecture.
-- RLS policies continue to enforce row-level access.

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT ON TABLE
    public.profiles,
    public.user_roles,
    public.students,
    public.interviewers,
    public.interviewer_availability,
    public.badge_required_skills,
    public.skill_progress,
    public.interviews,
    public.interview_results,
    public.badges
TO authenticated;

GRANT INSERT, UPDATE, DELETE ON TABLE
    public.interviewer_availability
TO authenticated;
