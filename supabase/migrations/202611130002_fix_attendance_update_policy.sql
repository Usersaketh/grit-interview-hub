DROP POLICY IF EXISTS
    "assigned interviewer or staff updates attendance"
ON public.interview_attendance;

CREATE POLICY "assigned interviewer or staff updates attendance"
ON public.interview_attendance
FOR UPDATE
USING (
    EXISTS (
        SELECT 1
        FROM public.interviews i
        WHERE i.id = interview_attendance.interview_id
          AND (
              i.interviewer_id = public.current_interviewer_id()
              OR public.is_staff()
          )
    )
)
WITH CHECK (
    marked_by = auth.uid()
    AND EXISTS (
        SELECT 1
        FROM public.interviews i
        WHERE i.id = interview_attendance.interview_id
          AND (
              i.interviewer_id = public.current_interviewer_id()
              OR public.is_staff()
          )
    )
);
