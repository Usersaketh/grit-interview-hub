# GRIT Interview Hub

## Product Requirements Document (PRD), Functional Specification & Technical Design

**Version:** 1.0\
**Status:** Proposed product design\
**Product type:** Interview scheduling and badge-certification
management module\
**Target platform:** GRIT / NIAT\
**Prepared for:** AI Product Engineer -- Round 1 Assignment\
**Working assumption:** This document describes a proposed standalone
module designed for eventual integration with GRIT. Actual integration
requires confirmation of GRIT's APIs, identity provider, data model,
security requirements and deployment environment.

------------------------------------------------------------------------

# 1. Executive Summary

GRIT Interview Hub is a centralized interview-management module for the
final interview stage of GRIT's skill-based badge certification journey.

Students complete the required skill contests and assessments for a
particular badge. Once all required skill clearances are verified, they
become eligible to book a live interview. Interviewers manage their
availability, conduct interviews and record outcomes. Operations teams
monitor the pipeline, manage exceptions and maintain certification
integrity.

The system covers the complete lifecycle:

1.  Determine student eligibility for a specific badge.
2.  Generate bookable interview slots from interviewer availability.
3.  Allow eligible students to book, cancel or reschedule interviews
    according to policy.
4.  Give interviewers a daily schedule and evaluation workflow.
5.  Publish interview status and results to students.
6.  Trigger badge certification after a valid pass.
7.  Support malpractice review and post-award badge nullification.
8.  Provide operations visibility into eligible, booked, unbooked and
    pending students.
9.  Preserve an auditable history of bookings, evaluations and
    certification changes.
10. Integrate with GRIT through replaceable adapters and explicit
    API/event contracts.

**Product principle:** GRIT Interview Hub should not recreate GRIT's
student, track, badge or skill systems. Those should remain owned by
GRIT. Interview Hub should own interview scheduling and evaluation
records, while coordinating badge certification with the existing GRIT
platform.

------------------------------------------------------------------------

# 2. Product Vision and Goals

## 2.1 Vision

Make the final interview stage of GRIT predictable, transparent,
reliable and operationally efficient for students, interviewers and the
interview operations team.

## 2.2 Primary goals

-   Let eligible students book interviews without manual coordination.
-   Give interviewers control over their availability and daily
    workload.
-   Reduce double bookings, scheduling conflicts and missed
    communications.
-   Give operations teams a live view of the interview pipeline.
-   Make interview outcomes visible to students in a timely and
    understandable way.
-   Preserve complete evaluation and certification history.
-   Support post-award malpractice review without destroying the
    original pass record.
-   Make the module integration-ready without coupling it to unknown
    GRIT internals.

## 2.3 Non-goals for the first release

-   Rebuilding GRIT's complete learning management system.
-   Replacing GRIT's skill contests or assessment engine.
-   Replacing the existing student identity/profile system.
-   Building a video-conferencing platform.
-   Automating interview decisions using AI.
-   Automatically confirming malpractice allegations without human
    review.
-   Building a complex microservices platform for an initial module.

## 2.4 Success measures

Suggested metrics to validate after launch:

-   Percentage of eligible students who book an interview.
-   Median time from eligibility to booking.
-   Interviewer slot utilization.
-   Booking conflict rate (target: zero confirmed overlaps).
-   Interview no-show rate.
-   Median time from interview completion to result publication.
-   Number of pending evaluations beyond the configured SLA.
-   Notification delivery success rate.
-   Number of certification synchronization failures.
-   Number of unauthorized or rejected operations.

------------------------------------------------------------------------

# 3. Users, Roles and Permissions

The system supports four primary roles. A user may hold more than one
role only if explicitly authorized.

## 3.1 Student

### Responsibilities

-   Complete the required GRIT skills.
-   Review badge-specific eligibility.
-   Select an available interview slot.
-   Attend the interview.
-   Review the result and any permitted feedback.
-   Follow retake instructions where applicable.

### Capabilities

-   View their own profile, track and badge progress.
-   View badge-specific interview eligibility.
-   View available interview slots.
-   Book one active interview per badge.
-   View, cancel or reschedule their own booking according to policy.
-   View upcoming and past interviews.
-   View published outcomes and badge certification status.
-   Receive in-app and email notifications.

### Restrictions

-   Cannot change skill progress or eligibility.
-   Cannot book if server-side eligibility validation fails.
-   Cannot book multiple active interviews for the same badge.
-   Cannot view another student's private information.
-   Cannot change attendance, interview outcomes or badge status.
-   Cannot access internal malpractice evidence or reviewer notes.

## 3.2 Interviewer

### Responsibilities

-   Maintain accurate availability.
-   Review assigned interviews.
-   Conduct interviews.
-   Record attendance and evaluation outcomes promptly.

### Capabilities

-   Configure recurring weekly availability.
-   Add date-specific availability and unavailable periods.
-   View personal daily and weekly schedules.
-   View assigned student and badge context required for the interview.
-   Mark attendance.
-   Start and complete an interview.
-   Record PASS, FAIL or RETAKE LATER.
-   Submit feedback according to visibility policy.
-   View their own previous interviews.

### Restrictions

-   Cannot modify another interviewer's availability.
-   Cannot access interviews not assigned to them unless explicitly
    granted.
-   Cannot alter a submitted result without an authorized correction
    workflow.
-   Cannot directly edit student skill progress.
-   Cannot independently confirm malpractice or nullify a badge unless
    granted a separate permission.

## 3.3 Interview Operations / Admin

### Responsibilities

-   Monitor the interview pipeline.
-   Resolve scheduling exceptions.
-   Maintain interviewer capacity and allocation.
-   Ensure pending evaluations are completed.
-   Coordinate malpractice review.

### Capabilities

-   View eligible, booked and unbooked students.
-   Filter by campus, track, badge, interviewer, date and status.
-   View interviewer schedules and workload.
-   Reassign interviews.
-   Cancel or reschedule bookings with a recorded reason.
-   Monitor no-shows and pending evaluations.
-   Review malpractice cases if authorized.
-   Initiate badge nullification or reinstatement workflows if
    authorized.
-   View reports and audit history.

### Restrictions

-   Sensitive actions must require explicit permissions.
-   Manual overrides must capture actor, timestamp and reason.
-   Operations users should not silently overwrite evaluation history.

## 3.4 System Administrator

### Capabilities

-   Manage user access and role assignments.
-   Configure booking windows, interview durations and buffer periods.
-   Configure cancellation and rescheduling policies.
-   Configure retake rules and result visibility.
-   Manage integration credentials and event subscriptions.
-   View system health, logs and audit events.

### Restrictions

-   Administrative access does not remove the requirement for audit
    logging.
-   Production secrets must never be exposed in the client application.
-   High-impact actions should require confirmation and, where
    appropriate, separate approval.

## 3.5 Permission matrix

  ----------------------------------------------------------------------------
  Action                  Student    Interviewer     Operations   System Admin
  ---------------- -------------- -------------- -------------- --------------
  View own                    Yes            Yes            Yes            Yes
  dashboard

  View own                    Yes             No            Yes            Yes
  eligibility

  Book own                    Yes             No      By policy      By policy
  interview

  Manage own                   No            Yes            Yes            Yes
  availability

  View assigned                No            Yes            Yes            Yes
  schedule

  Record assigned              No            Yes     Authorized     Authorized
  outcome                                              override       override

  View all                     No             No            Yes            Yes
  eligible
  students

  Reassign                     No             No            Yes            Yes
  interview

  Review                       No             No     Authorized            Yes
  malpractice                                          reviewer

  Nullify badge                No             No     Authorized            Yes
                                                       reviewer

  Manage                       No             No        Limited            Yes
  roles/settings
  ----------------------------------------------------------------------------

------------------------------------------------------------------------

# 4. Domain Concepts and Source of Truth

The product must distinguish between the following concepts:

-   **Eligibility:** Whether the student's skill progress satisfies the
    requirements for a particular badge.
-   **Booking:** A scheduled appointment between one student and one
    interviewer.
-   **Attendance:** Whether the student and interviewer attended.
-   **Evaluation:** The interviewer's outcome and feedback.
-   **Certification:** Whether GRIT has awarded the badge based on a
    valid pass.
-   **Malpractice review:** A separate process that may affect a
    previously awarded badge.

These concepts must not be collapsed into a single status field.

## 4.1 Proposed source-of-truth ownership

  -----------------------------------------------------------------------
  Information                         Source of truth
  ----------------------------------- -----------------------------------
  Student identity/profile            Existing GRIT identity/student
                                      service

  Campus                              Existing GRIT platform

  Tracks and badges                   Existing GRIT platform

  Required badge skills               Existing GRIT platform

  Skill completion                    Existing GRIT assessment/skill
                                      service

  Interviewer profiles                Interview Hub initially, or GRIT
                                      identity service if available

  Interviewer availability            Interview Hub

  Interview bookings                  Interview Hub

  Attendance                          Interview Hub

  Interview outcomes                  Interview Hub

  Interview history                   Interview Hub

  Official badge certification        Existing GRIT certification
                                      service, if one exists

  Malpractice review records          Agreed owner; proposed Interview
                                      Hub with GRIT synchronization
  -----------------------------------------------------------------------

The exact ownership of certification and malpractice data must be
confirmed with the GRIT platform team.

------------------------------------------------------------------------

# 5. End-to-End User Journeys

## 5.1 Student journey

1.  Student signs in using the agreed authentication mechanism.
2.  Student opens the GRIT dashboard.
3.  Interview Hub obtains the student's current track, badge and
    skill-clearance data.
4.  The eligibility service evaluates each badge independently.
5.  For an eligible badge, the dashboard displays an interview call to
    action.
6.  Student opens the badge details and reviews the requirements.
7.  Student selects an available date and slot.
8.  Server revalidates eligibility and slot availability.
9.  Booking is committed atomically.
10. Student receives confirmation.
11. Student attends the interview.
12. Interviewer records attendance and an outcome.
13. Student sees the published result.
14. If passed, the certification workflow requests badge award from
    GRIT.
15. If failed or asked to retake, the student sees the relevant next
    step.
16. If malpractice is later confirmed, the affected badge is marked
    nullified through an authorized process.

A student's eligibility and booking state must be calculated
independently for each badge. Clearing one badge does not imply
eligibility for every other badge.

## 5.2 Interviewer journey

1.  Interviewer signs in.
2.  Interviewer configures weekly availability and date-specific
    exceptions.
3.  System generates valid slots according to duration, buffer and
    booking-window rules.
4.  Interviewer views daily and weekly schedules.
5.  Interviewer opens an assigned appointment.
6.  Interviewer reviews the student and badge context.
7.  Interviewer marks attendance.
8.  Interviewer starts and completes the interview.
9.  Interviewer selects PASS, FAIL or RETAKE LATER.
10. Interviewer adds feedback and any required retake date.
11. System validates the transition and saves the evaluation.
12. Student and operations dashboards update.
13. If PASS, certification processing begins.

## 5.3 Operations journey

1.  Operations user opens the pipeline dashboard.
2.  System displays eligible students and their booking status.
3.  Operations filters by campus, track, badge, date or interviewer.
4.  Operations identifies unbooked students and pending evaluations.
5.  Operations reviews interviewer capacity.
6.  Operations handles cancellations, reassignments and exceptions.
7.  Operations monitors certification synchronization.
8.  Authorized reviewers handle malpractice cases.
9.  All privileged actions are recorded in the audit log.

------------------------------------------------------------------------

# 6. Functional Requirements

## Module A --- Eligibility Management

**Purpose:** Determine whether a student can book an interview for a
particular badge.

### Requirements

-   Retrieve the student's current GRIT track and badge information.
-   Retrieve the required skills and required levels for the badge.
-   Retrieve verified student skill-clearance records.
-   Evaluate all required skills.
-   Mark the student eligible only when every requirement is satisfied.
-   Prevent booking when a requirement is incomplete or unverified.
-   Revalidate eligibility at booking time, not only when rendering the
    page.
-   Recalculate or invalidate eligibility when source skill records
    change.
-   Retain the eligibility decision context for troubleshooting.

### Proposed eligibility rule

A student is eligible for a badge interview when:

`all_required_skill_clearances_are_verified = true`

AND

`no_active_booking_restriction = true`

Additional business restrictions, if any, must be supplied by GRIT.

### Eligibility states

-   `NOT_ELIGIBLE`
-   `ELIGIBLE`
-   `BOOKING_AVAILABLE`
-   `BOOKED`
-   `COMPLETED`

These are useful display or derived states. They should not replace the
interview booking lifecycle.

### Failure behaviour

If GRIT's skill service is unavailable, the system must not assume the
student is eligible. It should show a temporary verification state and
allow retry.

## Module B --- Interviewer Availability

**Purpose:** Let interviewers define when students can book them.

### Requirements

-   Configure recurring weekly availability.
-   Add one-off available periods.
-   Add unavailable dates and periods.
-   Configure interview duration.
-   Configure buffer time between appointments.
-   Set minimum notice and maximum booking horizon.
-   View confirmed bookings alongside availability.
-   Prevent overlapping confirmed appointments.
-   Prevent students from booking expired or invalid slots.
-   Preserve existing bookings when availability changes.

### Example schedule

Interviewer: Ananya Rao

  Day         Availability
  ----------- -------------------
  Monday      10:00 AM--1:00 PM
  Tuesday     2:00 PM--5:00 PM
  Wednesday   Unavailable
  Thursday    10:00 AM--4:00 PM
  Friday      10:00 AM--1:00 PM

Example configuration: - Interview duration: 30 minutes. - Buffer: 10
minutes. - Timezone: Configured interviewer timezone.

The system derives bookable slots from the availability window,
duration, buffer and existing appointments.

### Availability-change rule

An interviewer cannot silently invalidate a confirmed appointment. If an
interviewer becomes unavailable: 1. Identify affected bookings. 2.
Notify operations. 3. Offer reassignment or rescheduling. 4. Notify the
student once the new arrangement is confirmed. 5. Retain the original
booking record and reason for change.

## Module C --- Student Booking

**Purpose:** Allow eligible students to book a valid appointment.

### Requirements

-   Display eligible badges.
-   Allow a student to choose a badge.
-   Display available dates and slots.
-   Show relevant interviewer information where policy permits.
-   Display the student's timezone clearly.
-   Confirm the selected slot before booking.
-   Revalidate eligibility and availability on the server.
-   Prevent duplicate active bookings for the same student/badge.
-   Prevent interviewer overlaps.
-   Commit booking atomically.
-   Return a clear success or conflict response.
-   Support cancellation and rescheduling according to policy.
-   Trigger notifications after successful booking.

### Booking flow

1.  Student selects an eligible badge.
2.  Student requests available slots.
3.  System returns slots that are still bookable.
4.  Student selects a slot.
5.  Client submits the booking request with an idempotency key.
6.  Server checks identity, eligibility, booking policy and slot state.
7.  Database transaction reserves the slot.
8.  Booking confirmation is returned.
9.  Notification event is queued.

### Core invariants

-   One active booking per student per badge.
-   One interviewer cannot have overlapping confirmed interviews.
-   A slot cannot be confirmed for two students.
-   Client-side disabled buttons are not a security or concurrency
    control.
-   Retried requests must not create duplicate bookings.

## Module D --- Interview Execution and Evaluation

**Purpose:** Let interviewers record attendance and evaluation.

### Requirements

-   Show daily and weekly schedules.
-   Show appointment details and badge context.
-   Mark student and interviewer attendance separately.
-   Support interview start and completion.
-   Record one of the required outcomes:
    -   `PASS`
    -   `FAIL`
    -   `RETAKE_LATER`
-   Capture evaluator identity and submission timestamp.
-   Capture feedback according to configured visibility.
-   Require a retake date or policy reference when RETAKE_LATER is
    selected.
-   Prevent unauthorized or duplicate result submissions.
-   Provide an audited correction workflow.

### Outcome behaviour

**PASS** - Preserve the passing evaluation. - Start badge certification
processing. - Show the student a pending certification state until GRIT
confirms award. - Mark the badge awarded only after the agreed
certification process succeeds.

**FAIL** - Preserve the failed evaluation. - Publish the result
according to policy. - Display next-step information. - Apply any
configured attempt or waiting-period rules.

**RETAKE_LATER** - Preserve the retake recommendation. - Record the
earliest eligible retake date or policy. - Prevent booking before the
allowed date. - Allow a new interview attempt when the student is
eligible.

### Attendance is separate from outcome

Attendance values: - `ATTENDED` - `STUDENT_NO_SHOW` -
`INTERVIEWER_NO_SHOW` - `BOTH_ABSENT` - `NOT_RECORDED`

A no-show must not automatically become FAIL unless GRIT explicitly
defines that rule. Attendance and evaluation must be independently
stored.

## Module E --- Operations Dashboard

**Purpose:** Provide end-to-end operational visibility.

### KPI cards

-   Total eligible students.
-   Eligible students not yet booked.
-   Students with active bookings.
-   Interviews scheduled today.
-   Interviews completed.
-   Evaluations awaiting submission.
-   Passed interviews.
-   Failed interviews.
-   Retake cases.
-   No-shows.
-   Available interviewer capacity.

### Student pipeline table

  Column           Purpose
  ---------------- --------------------------------------
  Student          Name and external student identifier
  Campus           Student campus
  Track            Relevant GRIT track
  Badge            Badge under consideration
  Eligibility      Current eligibility
  Booking status   Booked / Not booked
  Interview date   Scheduled date and time
  Interviewer      Assigned interviewer
  Outcome          Pending / Pass / Fail / Retake
  Certification    Pending / Awarded / Nullified

### Filters

-   Campus.
-   Track.
-   Badge.
-   Interviewer.
-   Booking status.
-   Interview status.
-   Outcome.
-   Certification status.
-   Date range.

### Operations actions

-   Open student interview history.
-   View interviewer schedule.
-   Reassign an interview.
-   Cancel or reschedule with a reason.
-   Follow up on pending evaluations.
-   Review notification and integration failures.
-   Access malpractice workflow when authorized.

## Module F --- Malpractice and Badge Revocation

**Purpose:** Preserve certification integrity after a badge has been
awarded.

### Workflow

1.  An incident is reported.
2.  A malpractice case is created and linked to the relevant student and
    badge.
3.  Evidence references and a reason are recorded.
4.  The case enters review.
5.  An authorized reviewer dismisses or confirms the case.
6.  If confirmed, the certification service is asked to nullify the
    specific badge award.
7.  Student receives an appropriate notification.
8.  Original interview outcome and badge-award history remain intact.
9.  If an appeal succeeds, an authorized reinstatement action restores
    the badge.

### Rules

-   A report alone does not nullify a badge.
-   Confirmation requires an authorized reviewer.
-   Nullification applies to the specific affected badge, not every
    badge owned by the student.
-   Never overwrite the original PASS evaluation.
-   Record reviewer, reason, timestamp and evidence references.
-   Reinstatement must be a new auditable action, not deletion of the
    nullification record.
-   Student-facing messages must avoid exposing confidential reporter or
    evidence details.

------------------------------------------------------------------------

# 7. State Model and Transitions

Interview lifecycle, attendance, evaluation and certification must be
separate state dimensions.

## 7.1 Booking/interview states

  -------------------------------------------------------------------------
  State                     Meaning                 Trigger / transition
  ------------------------- ----------------------- -----------------------
  `NOT_ELIGIBLE`            Required skill          Skill requirements not
                            clearances incomplete   met

  `ELIGIBLE`                Requirements met        Eligibility service
                                                    confirms requirements

  `AVAILABLE_TO_BOOK`       Valid slots can be      Booking window and
                            booked                  capacity permit

  `BOOKED`                  Appointment confirmed   Atomic booking succeeds

  `RESCHEDULE_PENDING`      Change request is being Student or operations
                            processed               requests change

  `CANCELLED`               Booking cancelled       Authorized cancellation
                                                    succeeds

  `INTERVIEWER_CANCELLED`   Interviewer cannot      Operations confirms
                            conduct appointment     cancellation

  `IN_PROGRESS`             Interview has started   Interviewer starts
                                                    session

  `AWAITING_OUTCOME`        Interview completed;    Interviewer marks
                            evaluation not          completion
                            submitted

  `EVALUATED`               Evaluation submitted    Valid outcome saved

  `NO_SHOW`                 Student did not attend  Authorized attendance
                                                    marking
  -------------------------------------------------------------------------

The outcome is stored separately as `PASS`, `FAIL` or `RETAKE_LATER`.

## 7.2 Main flow

`NOT_ELIGIBLE → ELIGIBLE → AVAILABLE_TO_BOOK → BOOKED → IN_PROGRESS → AWAITING_OUTCOME → EVALUATED`

From `EVALUATED`: - `PASS` → certification processing → badge award
confirmed. - `FAIL` → failed attempt recorded; next attempt follows
policy. - `RETAKE_LATER` → retake waiting period → eligible to book a
new attempt.

Cancellation before interview completion returns the student to a
bookable state if eligibility and policy still permit it.

## 7.3 Certification states

-   `LOCKED`
-   `ELIGIBLE_FOR_INTERVIEW`
-   `CERTIFICATION_PENDING`
-   `AWARDED`
-   `NULLIFICATION_UNDER_REVIEW`
-   `NULLIFIED`
-   `REINSTATED`

## 7.4 Malpractice states

-   `REPORTED`
-   `UNDER_REVIEW`
-   `DISMISSED`
-   `CONFIRMED`
-   `APPEALED`
-   `REINSTATED` (case resolution, where applicable)

A confirmed case may trigger certification nullification. The
malpractice state and badge certification state should remain separately
traceable.

------------------------------------------------------------------------

# 8. Screen-by-Screen UX Specification

The interface should be responsive and role-aware. A single application
should provide role-specific navigation rather than three disconnected
applications.

## 8.1 Student application

### Screen S1 --- Student Home Dashboard

**Purpose:** Give the student a clear summary of progress and the next
action.

Components: - Student name and campus. - Current track. - Overall skill
progress. - Badge cards and progress. - Interview eligibility callout. -
Upcoming interview card. - Latest result. - Recent activity.

Key states: - No eligible badge: show progress and explain what
remains. - Eligible and not booked: show a prominent Book Interview
action. - Booked: show appointment details and calendar action. -
Awaiting outcome: show result-pending state. - Passed and certified:
show earned badge. - Failed: show result and permitted next steps. -
Retake: show earliest rebooking date. - Nullified: show a clear,
respectful status and official next step.

### Screen S2 --- Badge Details

Components: - Badge name, track and level. - Required skills
checklist. - Completed and pending skill levels. - Eligibility status. -
Interview booking CTA. - Previous interview attempts. - Certification
status.

Actions: - Book interview. - View booking. - View result/history.

### Screen S3 --- Interview Booking

Components: - Selected badge summary. - Date picker/calendar. -
Available slot list. - Interviewer information, if visible. - Timezone
label. - Booking policy note. - Confirmation step.

States: - Loading slots. - No slots available. - Slot just booked by
another student. - Eligibility verification unavailable. - Booking
confirmed. - Booking rejected by policy.

### Screen S4 --- Booking Details

Components: - Badge. - Interviewer. - Date/time and timezone. - Meeting
instructions or link, when available. - Cancellation/reschedule
policy. - Booking status.

Actions: - Reschedule. - Cancel. - Add to calendar (future enhancement).

### Screen S5 --- Interview Result

Components: - Outcome. - Interview date. - Badge. - Feedback visible to
student. - Certification status. - Retake information, where
applicable. - Next action.

Important distinction: a PASS evaluation may initially show
"Certification processing" rather than "Badge awarded" until GRIT
confirms the award.

### Screen S6 --- Interview History

Components: - All attempts. - Dates and interviewers. - Attendance. -
Outcome. - Feedback visibility. - Cancellation/no-show records. -
Certification events.

## 8.2 Interviewer application

### Screen I1 --- Interviewer Overview

Components: - Today's interview count. - Upcoming interviews. - Pending
evaluations. - Weekly workload. - Availability summary. - Alerts for
schedule conflicts or overdue evaluations.

### Screen I2 --- Availability Management

Components: - Weekly calendar. - Recurring availability editor. -
Date-specific overrides. - Unavailable periods. - Interview duration. -
Buffer time. - Booking horizon and notice settings, if permitted.

Actions: - Add availability. - Edit availability. - Block a period. -
Preview generated slots.

### Screen I3 --- Daily Schedule

Components: - Chronological appointment list. - Student name and
identifier. - Badge and track. - Start time. - Booking status. -
Attendance status. - Evaluation status.

Actions: - Open interview. - Mark attendance. - Start interview. -
Complete interview. - Submit evaluation.

### Screen I4 --- Evaluation Form

Components: - Student and badge summary. - Interview details. -
Attendance controls. - PASS / FAIL / RETAKE LATER selection. - Feedback
field. - Retake date selector when applicable. - Confirmation dialog.

Validation: - Outcome is required. - Feedback may be required by
policy. - Retake date is required if the retake policy needs one. -
Result submission is idempotent. - Submitted outcomes cannot be silently
overwritten.

## 8.3 Operations application

### Screen O1 --- Operations Overview

Components: - Pipeline KPIs. - Booked/unbooked ratio. - Today's
schedule. - Pending evaluation queue. - Interviewer utilization. -
Certification sync health. - Recent exceptions.

### Screen O2 --- Eligible Students

Components: - Searchable student table. - Campus, track and badge
filters. - Eligibility and booking status. - Interview details. - Last
updated timestamp.

Primary purpose: identify eligible students who have not booked.

### Screen O3 --- Interview Calendar

Components: - Day/week calendar. - Interviewer filter. - Booking
status. - Capacity overview. - Conflict and cancellation indicators.

### Screen O4 --- Interview Management

Components: - Interview details. - Student and interviewer. - Booking
timeline. - Attendance and outcome. - Reassignment and cancellation
actions. - Reason capture.

### Screen O5 --- Malpractice Review

Components: - Case queue. - Student and badge reference. - Reported
reason. - Evidence reference with restricted access. - Review status. -
Reviewer notes. - Confirm/dismiss actions. - Appeal/reinstatement
history.

### Screen O6 --- Reports and Audit

Components: - Booking and completion reports. - Interviewer workload. -
Pending result aging. - Certification synchronization status. -
Searchable audit records.

------------------------------------------------------------------------

# 9. Before-and-After Dashboard Behaviour

Dashboard screens must be driven by persisted application state, not
static mockups.

  -----------------------------------------------------------------------
  Scenario                Before                  After
  ----------------------- ----------------------- -----------------------
  Skills incomplete       Badge locked            Badge becomes
                                                  interview-eligible
                                                  after verified
                                                  completion

  Eligible, not booked    Book interview CTA      Appointment confirmed

  Interview booked        Booking CTA             Upcoming interview card

  Interview completed     Awaiting evaluation     Result displayed

  PASS                    Certification pending   Badge awarded after
                                                  GRIT confirmation

  FAIL                    Interview pending       Failed result and next
                                                  steps

  RETAKE_LATER            Evaluation pending      Retake instructions and
                                                  date

  Malpractice reported    Badge awarded           Review-pending state,
                                                  if policy requires
                                                  visible indication

  Malpractice confirmed   Badge awarded           Badge nullified

  Appeal accepted         Badge nullified         Badge reinstated
  -----------------------------------------------------------------------

For the assignment prototype, include working state transitions so
evaluators can see the student dashboard change after booking and after
each outcome.

------------------------------------------------------------------------

# 10. Student Communication

The system should support in-app notifications and email notifications.
Messages should be template-driven and populated with actual record
values.

## 10.1 Three primary messages

### Message 1 --- Eligibility

**You're one step away from earning your badge!**

You've completed all the required skills for your \[Badge Name\] badge.
Book your level-clearance interview to complete your badge journey.

**CTA:** Book Interview

### Message 2 --- Booking confirmation

**Your interview is confirmed!**

Your interview for the \[Badge Name\] badge is scheduled for \[Date\] at
\[Time\].

Interviewer: \[Interviewer Name\]

Please join a few minutes early and keep your camera enabled.

**CTA:** View Interview Details

### Message 3 --- Successful result

**Congratulations! You've earned your badge!**

You've successfully cleared your level-clearance interview for \[Badge
Name\].

Your badge has been awarded. Keep progressing towards your next
milestone!

**CTA:** View My Badge

## 10.2 Additional required templates

-   Booking cancellation.
-   Rescheduling request received.
-   Rescheduling confirmation.
-   Interviewer cancellation.
-   Interview reminder.
-   Interview starting soon.
-   Interview result: FAIL.
-   Interview result: RETAKE LATER.
-   Retake booking available.
-   No-show recorded.
-   Evaluation delayed.
-   Malpractice review initiated.
-   Badge nullified.
-   Badge reinstated.

## 10.3 Notification rules

-   Do not send a booking confirmation until the booking transaction
    succeeds.
-   Do not send a badge-awarded message until certification is confirmed
    by the authoritative service.
-   Retry failed email delivery without duplicating the underlying
    booking or result.
-   Store notification delivery status.
-   Avoid exposing confidential malpractice evidence or reporter
    identity.
-   Use the student's preferred/registered communication channel where
    supported.

------------------------------------------------------------------------

# 11. Data Model

Use PostgreSQL with UUID primary keys, foreign keys, check constraints
and appropriate indexes. The following is a logical schema; exact types
and constraints should be finalized during implementation.

## 11.1 Identity and access

### `users`

-   `id` UUID, primary key
-   `external_user_id` nullable, unique
-   `name`
-   `email`, unique
-   `role` or role mapping
-   `is_active`
-   `created_at`
-   `updated_at`

For more flexible authorization, use separate `roles` and `user_roles`
tables instead of a single role column.

### `students`

-   `id` UUID, primary key
-   `user_id` FK to users
-   `external_student_id`, unique
-   `campus_id` or external campus reference
-   `created_at`

### `interviewers`

-   `id` UUID, primary key
-   `user_id` FK to users
-   `is_active`
-   `default_timezone`
-   `created_at`

## 11.2 GRIT domain references

These may be local read models or external identifiers, depending on
GRIT integration.

### `tracks`

-   `id`
-   `external_id`
-   `name`

### `badges`

-   `id`
-   `track_id`
-   `external_id`
-   `name`
-   `level`
-   `is_active`

### `skills`

-   `id`
-   `external_id`
-   `name`

### `badge_required_skills`

-   `id`
-   `badge_id`
-   `skill_id`
-   `required_level`

### `skill_progress`

-   `id`
-   `student_id`
-   `skill_id`
-   `achieved_level`
-   `status`
-   `verified_at`
-   `source_updated_at`

Do not treat a locally cached skill record as authoritative if GRIT is
the source of truth. Store source timestamps/version information and
define a freshness policy.

## 11.3 Availability

### `interviewer_availability`

-   `id`
-   `interviewer_id`
-   `day_of_week`
-   `start_time`
-   `end_time`
-   `timezone`
-   `effective_from`
-   `effective_until`
-   `is_active`

### `availability_overrides`

-   `id`
-   `interviewer_id`
-   `date`
-   `start_time`
-   `end_time`
-   `availability_type` (AVAILABLE / UNAVAILABLE)
-   `reason`
-   `created_by`

Recurring availability and date-specific overrides must be combined by a
deterministic slot-generation service.

## 11.4 Interviews and bookings

### `interviews`

-   `id` UUID, primary key
-   `student_id` FK
-   `badge_id` FK or external badge reference
-   `interviewer_id` FK
-   `start_time` timestamptz
-   `end_time` timestamptz
-   `timezone`
-   `status`
-   `booking_reference`, unique
-   `created_at`
-   `updated_at`
-   `cancelled_at`
-   `cancellation_reason`
-   `created_by`

Each retake is a new interview record. Do not overwrite the previous
attempt.

### `interview_reschedule_history`

-   `id`
-   `interview_id`
-   `old_start_time`
-   `old_end_time`
-   `new_start_time`
-   `new_end_time`
-   `requested_by`
-   `reason`
-   `created_at`

### `interview_attendance`

-   `id`
-   `interview_id`
-   `student_attendance`
-   `interviewer_attendance`
-   `marked_by`
-   `marked_at`
-   `notes`

## 11.5 Evaluation

### `interview_results`

-   `id`
-   `interview_id`
-   `outcome` (PASS / FAIL / RETAKE_LATER)
-   `feedback`
-   `evaluator_id`
-   `submitted_at`
-   `retake_after`
-   `visibility_status`

A unique constraint on the active/final result per interview should
prevent accidental duplicate submissions. Corrections should be
represented as audited amendments or superseding records, not silent
overwrites.

## 11.6 Certification and malpractice

### `badge_awards`

-   `id`
-   `student_id`
-   `badge_id`
-   `interview_result_id`
-   `external_award_id`
-   `status`
-   `awarded_at`
-   `revoked_at`
-   `reinstated_at`

### `malpractice_flags`

-   `id`
-   `student_id`
-   `badge_id`
-   `reported_by`
-   `reason_code`
-   `description`
-   `evidence_reference`
-   `review_status`
-   `reviewed_by`
-   `reviewed_at`
-   `created_at`

### `badge_reinstatements`

-   `id`
-   `badge_award_id`
-   `malpractice_flag_id`
-   `reason`
-   `approved_by`
-   `reinstated_at`

## 11.7 Notifications, audit and integration

### `notifications`

-   `id`
-   `user_id`
-   `type`
-   `template_key`
-   `payload`
-   `delivery_channel`
-   `delivery_status`
-   `attempt_count`
-   `last_error`
-   `created_at`
-   `sent_at`
-   `read_at`

### `audit_logs`

-   `id`
-   `actor_id`
-   `entity_type`
-   `entity_id`
-   `action`
-   `previous_value` JSONB
-   `new_value` JSONB
-   `reason`
-   `created_at`

### `idempotency_keys`

-   `id`
-   `actor_id`
-   `key`
-   `operation`
-   `response_reference`
-   `created_at`
-   unique constraint on actor, operation and key

### `integration_outbox`

-   `id`
-   `event_type`
-   `aggregate_type`
-   `aggregate_id`
-   `payload` JSONB
-   `status`
-   `attempt_count`
-   `next_attempt_at`
-   `created_at`
-   `published_at`

The outbox ensures a committed database operation can reliably produce
an integration event even if an external service is temporarily
unavailable.

------------------------------------------------------------------------

# 12. Database Integrity and Concurrency

These are critical requirements, not optional polish.

## 12.1 Booking uniqueness

Enforce one active interview per student and badge. This can be
implemented with a PostgreSQL partial unique index over active booking
states, or with a dedicated active-booking relation.

## 12.2 Interviewer overlap prevention

Prevent overlapping confirmed appointments for the same interviewer.
PostgreSQL range types and exclusion constraints are suitable. An
equivalent transactional locking strategy is acceptable if carefully
implemented.

## 12.3 Atomic booking

The booking transaction should: 1. Lock or reserve the selected slot. 2.
Revalidate eligibility. 3. Verify the slot remains available. 4. Verify
the student has no active booking for that badge. 5. Verify interviewer
overlap constraints. 6. Insert the interview. 7. Insert the outbox
event. 8. Commit.

If any validation fails, roll back the transaction and return a
meaningful conflict response.

## 12.4 Idempotency

The client sends an idempotency key for booking and result submission.
If a request is retried due to a timeout, the server returns the
original result instead of creating a duplicate.

## 12.5 Time handling

-   Store timestamps in UTC using `timestamptz`.
-   Store the relevant IANA timezone, such as `Asia/Kolkata`.
-   Display local time with an explicit timezone.
-   Define daylight-saving handling for interviewers outside India.
-   Never compare ambiguous local timestamp strings.

------------------------------------------------------------------------

# 13. API Design

The following are proposed REST contracts, not claims about existing
GRIT endpoints.

## 13.1 Student endpoints

  Method   Endpoint                                     Purpose
  -------- -------------------------------------------- ------------------------
  GET      `/api/student/dashboard`                     Dashboard summary
  GET      `/api/student/badges`                        Student badge progress
  GET      `/api/student/badges/:badgeId/eligibility`   Badge eligibility
  GET      `/api/student/available-slots`               Search bookable slots
  POST     `/api/student/interviews/book`               Book a slot
  GET      `/api/student/interviews`                    Interview history
  GET      `/api/student/interviews/:id`                Booking details
  POST     `/api/student/interviews/:id/cancel`         Cancel booking
  POST     `/api/student/interviews/:id/reschedule`     Request reschedule

## 13.2 Interviewer endpoints

  ----------------------------------------------------------------------------------------------
  Method                  Endpoint                                       Purpose
  ----------------------- ---------------------------------------------- -----------------------
  GET                     `/api/interviewer/dashboard`                   Workload summary

  GET                     `/api/interviewer/schedule`                    Daily/weekly schedule

  GET                     `/api/interviewer/availability`                Read availability

  POST                    `/api/interviewer/availability`                Create availability

  PUT                     `/api/interviewer/availability/:id`            Update availability

  DELETE                  `/api/interviewer/availability/:id`            Remove availability

  POST                    `/api/interviewer/interviews/:id/attendance`   Mark attendance

  POST                    `/api/interviewer/interviews/:id/start`        Start interview

  POST                    `/api/interviewer/interviews/:id/complete`     Mark completed

  POST                    `/api/interviewer/interviews/:id/result`       Submit outcome
  ----------------------------------------------------------------------------------------------

## 13.3 Operations endpoints

  ----------------------------------------------------------------------------------------
  Method                  Endpoint                                 Purpose
  ----------------------- ---------------------------------------- -----------------------
  GET                     `/api/admin/dashboard`                   Pipeline metrics

  GET                     `/api/admin/eligible-students`           Eligible student list

  GET                     `/api/admin/interviews`                  All interviews

  POST                    `/api/admin/interviews/:id/reassign`     Reassign interviewer

  POST                    `/api/admin/interviews/:id/cancel`       Cancel with reason

  POST                    `/api/admin/interviews/:id/reschedule`   Operations reschedule

  GET                     `/api/admin/interviewer-workload`        Capacity and
                                                                   utilization

  GET                     `/api/admin/malpractice`                 Malpractice queue

  POST                    `/api/admin/malpractice/:id/review`      Record review decision

  GET                     `/api/admin/audit-logs`                  Audit search
  ----------------------------------------------------------------------------------------

## 13.4 Integration endpoints/events

Potential contracts: -
`GET /api/integrations/grit/students/:externalStudentId` -
`GET /api/integrations/grit/badges/:externalBadgeId` -
`POST /api/integrations/grit/events` -
`POST /api/integrations/grit/badge-awards` -
`POST /api/integrations/grit/badge-awards/:id/nullify`

Actual paths, authentication, payloads and ownership must be agreed with
GRIT.

### Example event: badge certification awarded

``` json
{
  "event_id": "uuid",
  "event_type": "badge.certification.awarded",
  "occurred_at": "2026-11-13T06:00:00Z",
  "student_id": "external-student-id",
  "badge_id": "external-badge-id",
  "interview_id": "uuid",
  "result_id": "uuid"
}
```

### Example event: badge certification nullified

``` json
{
  "event_id": "uuid",
  "event_type": "badge.certification.nullified",
  "occurred_at": "2026-11-20T06:00:00Z",
  "student_id": "external-student-id",
  "badge_id": "external-badge-id",
  "badge_award_id": "uuid",
  "reason_code": "CONFIRMED_MALPRACTICE"
}
```

Consumers must deduplicate by event ID or another stable idempotency
identifier.

------------------------------------------------------------------------

# 14. System Architecture

## 14.1 Recommended architecture

Use a modular monolith for the initial product. It is simpler to build,
deploy, test and operate than microservices, while still allowing clear
domain boundaries.

### Frontend

-   Next.js
-   TypeScript
-   Tailwind CSS
-   shadcn/ui
-   Responsive layouts and accessible components

### Backend

-   Next.js server-side route handlers or a dedicated API service.
-   Domain/service layer separated from UI.
-   Server-side authorization.
-   Input validation and typed API contracts.

### Database and authentication

-   PostgreSQL.
-   Supabase may provide managed PostgreSQL and authentication for the
    prototype.
-   Use row-level security as defense in depth, not as a replacement for
    server-side authorization.
-   Production identity should integrate with GRIT's existing provider
    if available.

### Infrastructure

-   Vercel or the deployment platform approved by GRIT.
-   Managed PostgreSQL.
-   Background job runner for notifications and integration retries.
-   Email provider selected according to GRIT's infrastructure.
-   Error monitoring and structured logs.

## 14.2 Logical architecture

``` text
Student / Interviewer / Operations
                 |
                 v
       Next.js Web Application
                 |
                 v
      Authentication & Authorization
                 |
                 v
           API / Controllers
                 |
                 v
          Domain Services
     +-----------+------------+
     |           |            |
 Eligibility  Scheduling   Evaluation
 Service      Service      Service
     |           |            |
     +-----------+------------+
                 |
        Certification Service
                 |
        Notification Service
                 |
        Integration Adapter
                 |
                 v
             PostgreSQL
                 |
          Transactional Outbox
                 |
                 v
        Existing GRIT Platform
```

## 14.3 Domain boundaries

-   **Identity adapter:** Resolves authenticated users and external
    identities.
-   **GRIT data adapter:** Reads tracks, badges and skill progress.
-   **Eligibility service:** Evaluates badge-specific requirements.
-   **Scheduling service:** Generates availability and validates
    conflicts.
-   **Booking service:** Owns booking transactions and state
    transitions.
-   **Evaluation service:** Owns attendance and interview outcomes.
-   **Certification service:** Coordinates badge award/revocation with
    GRIT.
-   **Notification service:** Creates and delivers messages.
-   **Audit service:** Records critical actions.

------------------------------------------------------------------------

# 15. GRIT Integration Strategy

## 15.1 Integration principle

Interview Hub should be a modular component that can operate with seeded
demo data during development and later connect to GRIT through an
adapter.

It must not assume access to internal GRIT databases or undocumented
endpoints.

## 15.2 Integration stages

### Stage 1 --- Standalone prototype

-   Use clearly identified demo student, track, badge and skill data.
-   Use local authentication or demo role switching.
-   Keep external identifiers in the schema.
-   Implement the integration adapter interface even if its first
    implementation reads seeded data.

### Stage 2 --- Read integration

-   Integrate GRIT identity/authentication.
-   Retrieve student profile and campus.
-   Retrieve track and badge definitions.
-   Retrieve required skills and verified progress.
-   Establish data freshness and failure behaviour.

### Stage 3 --- Write integration

-   Send verified badge-award requests to GRIT.
-   Send badge-nullification requests after confirmed review.
-   Handle acknowledgements, retries and duplicate events.
-   Reconcile local and external certification states.

### Stage 4 --- Production hardening

-   Security review.
-   Load and concurrency testing.
-   Monitoring and alerting.
-   Backup and recovery testing.
-   Access-control validation.
-   Operational runbooks.

## 15.3 Integration contract questions

Before production integration, GRIT must clarify: 1. What identity
provider and SSO protocol are used? 2. Is there an API for student and
campus data? 3. Is there an API or event stream for skill completion? 4.
Where are badge definitions and required skill levels stored? 5. Which
service is authoritative for awarding a badge? 6. Which service is
authoritative for nullifying a badge? 7. Are webhooks or event
subscriptions available? 8. What are the API authentication and
rate-limit requirements? 9. What are the deployment, network and
data-residency requirements? 10. What is the expected behaviour when
GRIT is unavailable?

------------------------------------------------------------------------

# 16. Edge Cases and Expected Behaviour

  -----------------------------------------------------------------------
  Scenario                            Expected behaviour
  ----------------------------------- -----------------------------------
  Two students select the same slot   Database-level conflict protection;
                                      one booking succeeds

  Student already has an active       Reject duplicate booking
  booking for badge

  Student loses eligibility before    Reject booking after server-side
  booking                             revalidation

  Skill service is unavailable        Do not assume eligibility; show
                                      retry/verification state

  Interviewer becomes unavailable     Flag affected appointments and
                                      initiate reassignment

  Student cancels within allowed      Cancel, release slot and notify
  window                              parties

  Student cancels after cutoff        Apply configured policy; require
                                      operations override if applicable

  Student does not attend             Record no-show separately from
                                      evaluation

  Interviewer does not attend         Escalate and offer rebooking

  Interview completed but result      Keep awaiting-outcome state;
  missing                             notify/escalate

  Result submission is retried        Idempotency prevents duplicate
                                      result

  Retake date is in the future        Prevent booking before permitted
                                      date

  Malpractice is only reported        Keep award intact while case is
                                      reviewed, unless GRIT defines a
                                      temporary hold

  Malpractice is confirmed            Nullify only the affected badge
                                      through authorized workflow

  Appeal succeeds                     Reinstate through a new audited
                                      action

  Email provider fails                Retry delivery; do not roll back
                                      booking

  GRIT certification API fails        Keep certification pending and
                                      retry safely

  User attempts unauthorized access   Reject server-side and log security
                                      event

  Availability is edited around a     Preserve booking; require explicit
  booking                             resolution

  Interviewer has overlapping         Resolve with deterministic
  availability rules                  precedence and validation

  Student's local timezone differs    Display timezone clearly and store
                                      canonical timestamps

  Duplicate webhook arrives           Deduplicate using event
                                      ID/idempotency key
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 17. Assumptions and Open Product Questions

These decisions must be confirmed with GRIT. The prototype may use
clearly documented defaults, but production behaviour must be
configurable.

  -----------------------------------------------------------------------
  Question                            Proposed default for prototype
  ----------------------------------- -----------------------------------
  Interview duration?                 30 minutes

  Buffer between interviews?          10 minutes

  Can students choose interviewers?   Show available interviewer/slot;
                                      configurable

  Can students reschedule?            Yes, before a configurable cutoff

  Can students cancel?                Yes, before a configurable cutoff

  Maximum interview attempts?         Configurable; no arbitrary
                                      hardcoded limit

  Does FAIL allow another attempt?    Follow configurable policy

  Retake waiting period?              Set by interviewer or policy

  Can multiple badge interviews be    Yes, if slots do not conflict and
  active?                             policy permits

  Are interviewers badge-specific?    Support optional track/badge
                                      assignment

  Who confirms malpractice?           Authorized reviewer

  Does a report temporarily affect a  No, unless an approved policy says
  badge?                              otherwise

  Who owns official badge award?      Existing GRIT certification
                                      service, if available

  Which meeting platform is used?     Existing GRIT-approved platform;
                                      link may be optional in prototype

  What feedback is visible to         Configurable; publish only approved
  students?                           feedback
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 18. Security, Privacy and Reliability

## 18.1 Security

-   Enforce role-based access control on every protected server
    operation.
-   Validate resource ownership, not just user role.
-   Protect student records from cross-student access.
-   Restrict interviewers to assigned interviews and permitted student
    context.
-   Restrict malpractice evidence to authorized reviewers.
-   Store secrets only in server-side environment variables or a secrets
    manager.
-   Validate all inputs on the server.
-   Apply rate limits to sensitive endpoints.
-   Protect against CSRF where applicable and use secure session
    handling.
-   Use least-privilege database credentials.

## 18.2 Auditability

Log: - Booking created, cancelled and rescheduled. - Interviewer
reassignment. - Attendance changes. - Result submission and
correction. - Badge award and nullification. - Malpractice review
decisions. - Role and permission changes. - Administrative overrides.

Audit records should be append-only for ordinary application users.

## 18.3 Reliability

-   Use database transactions for booking and evaluation.
-   Use idempotency keys for retried commands.
-   Use a transactional outbox for external events.
-   Retry transient notification and integration failures.
-   Expose pending synchronization status to authorized operations
    users.
-   Monitor failed jobs and stale pending evaluations.
-   Define backup and recovery procedures.

## 18.4 Privacy

-   Collect only data needed for scheduling and evaluation.
-   Do not expose confidential evidence or reporter identity to
    students.
-   Apply retention rules for interview and malpractice records.
-   Restrict exports and bulk downloads.
-   Follow GRIT's privacy and data-handling policies before production
    deployment.

------------------------------------------------------------------------

# 19. Non-Functional Requirements

  -----------------------------------------------------------------------
  Area                                Requirement
  ----------------------------------- -----------------------------------
  Responsiveness                      Support desktop, tablet and mobile

  Performance                         Common dashboard requests should
                                      feel responsive; define measured
                                      SLOs with GRIT

  Reliability                         No confirmed double bookings

  Scalability                         Support thousands of students and
                                      growing interview volume

  Security                            Server-side authorization and least
                                      privilege

  Availability                        Graceful degradation when external
                                      services fail

  Maintainability                     Modular domain/service boundaries

  Auditability                        Traceable critical actions

  Accessibility                       Keyboard navigation, labels and
                                      sufficient contrast

  Data integrity                      Transaction-safe booking and
                                      certification

  Observability                       Structured logs, error monitoring
                                      and job status

  Recovery                            Automated backups and tested
                                      restore process
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 20. MVP Scope and Prioritization

## 20.1 Round 1 MVP --- Must have

1.  Student dashboard.
2.  Badge-specific eligibility display.
3.  Interviewer availability management.
4.  Slot generation.
5.  Student interview booking.
6.  Conflict-free booking.
7.  Interviewer daily schedule.
8.  Attendance recording.
9.  PASS / FAIL / RETAKE LATER evaluation.
10. Student result display.
11. Operations dashboard.
12. Eligible booked/unbooked student list.
13. Before-and-after dashboard states.
14. Malpractice review and badge-nullification demonstration.
15. Persistent database.
16. Role-based access.
17. Audit history for critical actions.
18. Working deployment.
19. README and Loom walkthrough.

## 20.2 Should have if time permits

-   Email notifications.
-   Rescheduling and cancellation.
-   Interviewer workload analytics.
-   Pending-evaluation reminders.
-   Certification outbox/retry simulation.
-   More comprehensive audit viewer.
-   Responsive mobile refinements.

## 20.3 Future enhancements

-   Google Calendar integration.
-   Video conferencing integration.
-   Automated reminders.
-   Interview rubrics and structured scoring.
-   Interviewer workload balancing.
-   Waitlists and slot recommendations.
-   Campus-level reporting.
-   Student appeals workflow.
-   Multi-stage malpractice approval.
-   Automated eligibility synchronization.
-   Advanced operational analytics.

------------------------------------------------------------------------

# 21. Acceptance Criteria

The product is functionally acceptable when the following can be
demonstrated:

1.  An ineligible student cannot book an interview.
2.  An eligible student can see valid available slots.
3.  A student can successfully book a slot.
4.  Two students cannot book the same interviewer slot.
5.  A student cannot create two active bookings for the same badge.
6.  Interviewers can create and update availability.
7.  Interviewers can see their daily schedules.
8.  Interviewers can mark attendance.
9.  Interviewers can record PASS, FAIL and RETAKE LATER.
10. Each retake creates a new interview attempt.
11. Students see their updated booking and result state.
12. PASS triggers certification processing.
13. The badge is shown as awarded only after certification confirmation.
14. FAIL and RETAKE show appropriate next steps.
15. Operations can identify eligible students who have not booked.
16. Operations can view interview and interviewer workloads.
17. A malpractice report can be reviewed.
18. A confirmed malpractice case can nullify the affected badge.
19. The original PASS and award history remain preserved.
20. Unauthorized actions are rejected.
21. Critical actions are written to audit history.
22. Data persists after refresh and across sessions.
23. External-service failures do not silently lose bookings or results.

------------------------------------------------------------------------

# 22. Proposed Implementation Plan

The Round 1 assignment has a short deadline. Prioritize a complete
vertical workflow over a large number of disconnected screens.

## Phase 1 --- Foundation

-   Create project and environment configuration.
-   Set up PostgreSQL and migrations.
-   Define users and roles.
-   Seed demo GRIT students, tracks, badges and skill progress.
-   Build role-aware navigation.
-   Implement authentication/demo role access.

## Phase 2 --- Eligibility and student experience

-   Implement badge eligibility service.
-   Build student dashboard.
-   Build badge details.
-   Build booking calendar and slot selection.

## Phase 3 --- Scheduling

-   Build interviewer availability management.
-   Generate available slots.
-   Implement atomic booking.
-   Add duplicate and overlap protection.
-   Build booking details and cancellation/rescheduling if time permits.

## Phase 4 --- Evaluation

-   Build interviewer daily schedule.
-   Add attendance actions.
-   Add evaluation form.
-   Implement PASS, FAIL and RETAKE LATER.
-   Preserve separate attempts.

## Phase 5 --- Operations and certification

-   Build booked/unbooked pipeline.
-   Build pending evaluation metrics.
-   Implement badge certification state.
-   Implement malpractice review and nullification demonstration.
-   Add audit history.

## Phase 6 --- Delivery

-   Test core workflows and edge cases.
-   Verify responsive behaviour.
-   Deploy.
-   Prepare README, architecture notes and demo credentials.
-   Record Loom walkthrough.

------------------------------------------------------------------------

# 23. Suggested Repository Structure

A modular Next.js implementation could use:

``` text
grit-interview-hub/
├── app/
│   ├── (auth)/
│   ├── student/
│   │   ├── dashboard/
│   │   ├── badges/
│   │   └── interviews/
│   ├── interviewer/
│   │   ├── dashboard/
│   │   ├── availability/
│   │   └── schedule/
│   ├── operations/
│   │   ├── dashboard/
│   │   ├── students/
│   │   ├── interviews/
│   │   ├── malpractice/
│   │   └── reports/
│   └── api/
├── components/
│   ├── ui/
│   ├── layout/
│   ├── student/
│   ├── interviewer/
│   └── operations/
├── features/
│   ├── eligibility/
│   ├── availability/
│   ├── booking/
│   ├── interviews/
│   ├── evaluation/
│   ├── certification/
│   ├── malpractice/
│   └── notifications/
├── lib/
│   ├── auth/
│   ├── db/
│   ├── validation/
│   └── permissions/
├── integrations/
│   └── grit/
│       ├── grit-adapter.ts
│       ├── demo-grit-adapter.ts
│       └── types.ts
├── database/
│   ├── migrations/
│   └── seed/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
│   ├── PRD.md
│   ├── API.md
│   └── INTEGRATION.md
├── public/
├── .env.example
├── README.md
└── package.json
```

The structure is illustrative. It can be adjusted to the chosen
framework and deployment environment, but domain logic should remain
separate from page components.

------------------------------------------------------------------------

# 24. Visual Design Direction

## 24.1 Design principles

-   Modern enterprise SaaS appearance.
-   Clean information hierarchy.
-   Strong readability and accessible contrast.
-   Consistent status labels and visual indicators.
-   Clear primary action on every screen.
-   Minimal unnecessary decoration.
-   Responsive tables and calendars.
-   Confirmations for destructive actions.

## 24.2 Suggested visual identity

  Token                Suggested value   Usage
  -------------------- ----------------- -------------------------
  Deep navy            `#101828`         Primary text/navigation
  Navy blue            `#243B63`         Navigation and headings
  Accent blue          `#4263EB`         Primary actions
  Success green        `#16A36A`         Passed/awarded
  Warning amber        `#F59E0B`         Pending/retake
  Neutral background   `#F8FAFC`         Page background

Typography: Inter or an equivalent modern sans-serif.

Use colour together with text labels and icons. Status must never be
communicated by colour alone.

## 24.3 Navigation

**Student** - Overview - My Tracks - My Badges - Interviews - Interview
History - Profile

**Interviewer** - Overview - My Schedule - Availability - Evaluations -
Interview History

**Operations** - Overview - Eligible Students - Interview Calendar -
Interviewers - Evaluations - Malpractice - Reports - Settings

------------------------------------------------------------------------

# 25. Demo Data and Prototype Integrity

The prototype should use realistic but clearly fictional data.

Suggested demo setup: - Multiple student accounts. - At least two
campuses. - Multiple tracks and badges. - Students with incomplete skill
requirements. - Students eligible but not booked. - Students with
upcoming bookings. - Interviewers with different availability. - Past
PASS, FAIL and RETAKE examples. - One pending evaluation. - One
malpractice case under review. - One confirmed nullification example.

Do not imply that fictional data is live GRIT data. Clearly label demo
records and explain the integration adapter in the README and Loom.

------------------------------------------------------------------------

# 26. Testing Strategy

## Unit tests

-   Eligibility calculation.
-   Slot generation.
-   Availability override precedence.
-   Interview state transitions.
-   Retake eligibility date.
-   Certification state transitions.
-   Permission checks.

## Integration tests

-   Booking transaction.
-   Concurrent booking conflict.
-   Duplicate idempotent booking request.
-   Result submission.
-   Badge award event creation.
-   Malpractice confirmation and nullification.
-   Outbox retry.

## End-to-end tests

1.  Ineligible student cannot book.
2.  Eligible student books an interview.
3.  Interviewer sees the booking.
4.  Interviewer records PASS.
5.  Student sees certification pending.
6.  Certification is confirmed.
7.  Student sees badge awarded.
8.  A separate attempt records FAIL or RETAKE.
9.  Operations reviews a malpractice report.
10. Confirmed malpractice nullifies the badge while preserving history.

## Manual QA

-   Mobile and desktop layouts.
-   Empty states.
-   Loading and error states.
-   Expired slots.
-   Timezone display.
-   Permission-denied screens.
-   Failed notification delivery.
-   External service unavailable.

------------------------------------------------------------------------

# 27. Loom Recording Plan

Target length: approximately 6--8 minutes.

1.  **Problem understanding (about 1 minute):** Explain why interview
    scheduling is the final step in badge certification.
2.  **Product architecture (about 1 minute):** Explain roles, domain
    boundaries and the separation of interview outcomes from badge
    certification.
3.  **Student walkthrough (about 1.5 minutes):** Show eligibility,
    booking, confirmation and dashboard changes.
4.  **Interviewer walkthrough (about 1.5 minutes):** Show availability,
    daily schedule, attendance and outcome submission.
5.  **Operations walkthrough (about 1 minute):** Show booked/unbooked
    visibility, pending evaluations and malpractice review.
6.  **Engineering decisions (about 1 minute):** Explain transactional
    booking, idempotency, audit history and GRIT integration adapter.
7.  **Trade-offs and future work (about 30 seconds):** Explain what is
    implemented, what is simulated and what requires GRIT API access.

The recording should be in the candidate's own words. Do not claim that
demo integrations are connected to production GRIT.

------------------------------------------------------------------------

# 28. Final Product Definition

GRIT Interview Hub is a modular interview lifecycle and badge
certification management system.

It connects: - Skill completion and eligibility. - Interviewer
availability. - Student booking. - Interview attendance. - Human
evaluation. - Badge certification. - Malpractice review and
revocation. - Operations reporting and audit history.

Its purpose is to eliminate manual coordination, reduce scheduling
conflicts, improve student transparency, provide operational visibility
and preserve the integrity of every badge awarded through GRIT.

**Integration-ready does not mean production-integrated.** The first
release can operate with controlled demo data and a replaceable GRIT
adapter. Actual production integration requires approved APIs, identity
contracts, data ownership decisions, security review and deployment
approval from the GRIT team.

The defining engineering principle is:

> Build the interview module as an independent, reliable domain that
> uses GRIT as the authority for student learning progress and official
> badge certification, while owning the scheduling and evaluation
> workflow it is responsible for.
