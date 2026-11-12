# API contract

All endpoints use `/api/v1`, JSON `{ "data": ... }` success bodies, and `{ "error": { "code", "message", "details?" } }` failure bodies. Validation errors are 422; unauthenticated 401; unauthorized 403; conflicts 409.

| Method | Endpoint | Roles | Status |
| --- | --- | --- | --- |
| GET | `/profile` | authenticated | implemented |
| GET | `/student/badges/:badgeId/eligibility` | Student | implemented |
| GET | `/student/interviews` | Student | implemented |
| POST | `/student/interviews/book` | Student | implemented |
| GET/POST | `/interviewer/availability` | Interviewer/staff; Interviewer | implemented |
| PUT/DELETE | `/interviewer/availability/:id` | owning Interviewer | implemented |
| POST | `/interviewer/interviews/:id/result` | assigned Interviewer | implemented |
| GET | `/admin/dashboard` | Operations/Admin | implemented |

Booking request:
```json
{"badgeId":"uuid","interviewerId":"uuid","startsAt":"2026-12-01T04:30:00Z","endsAt":"2026-12-01T05:00:00Z","timezone":"Asia/Kolkata","idempotencyKey":"uuid"}
```
It returns 201 with the persisted interview, or 409 `NOT_ELIGIBLE`, `SLOT_UNAVAILABLE`, or `BOOKING_CONFLICT`. The remaining PRD routes are documented as planned in `IMPLEMENTATION_STATUS.md`; they should follow this envelope and pagination convention (`limit`, `cursor`).
