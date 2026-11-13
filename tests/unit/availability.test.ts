import { describe, expect, it } from "vitest";
import {
  computeBookableSlots,
  generateSlots,
  windowsOverlap,
  zonedWallClockToUtc,
} from "@backend/modules/availability/service";

describe("availability", () => {
  it("recognizes overlap at range boundaries", () => {
    expect(
      windowsOverlap(
        { start: new Date("2026-01-01T10:00:00Z"), end: new Date("2026-01-01T11:00:00Z") },
        { start: new Date("2026-01-01T11:00:00Z"), end: new Date("2026-01-01T12:00:00Z") }
      )
    ).toBe(false);
  });

  it("excludes busy slots", () => {
    const slots = generateSlots(
      { start: new Date("2026-01-01T10:00:00Z"), end: new Date("2026-01-01T11:30:00Z") },
      30,
      0,
      [{ start: new Date("2026-01-01T10:30:00Z"), end: new Date("2026-01-01T11:00:00Z") }]
    );
    expect(slots).toHaveLength(2);
  });

  it("converts wall-clock times accurately across DST transitions", () => {
    // Before US DST spring forward (EST = UTC-5)
    const winter = zonedWallClockToUtc("2026-03-06", "09:00", "America/New_York");
    expect(winter.toISOString()).toBe("2026-03-06T14:00:00.000Z");

    // After US DST spring forward (EDT = UTC-4)
    const spring = zonedWallClockToUtc("2026-03-09", "09:00", "America/New_York");
    expect(spring.toISOString()).toBe("2026-03-09T13:00:00.000Z");

    // Fixed-offset IST (UTC+05:30)
    const ist = zonedWallClockToUtc("2026-11-16", "10:00", "Asia/Kolkata");
    expect(ist.toISOString()).toBe("2026-11-16T04:30:00.000Z");
  });

  it("computes bookable slots applying busy bookings, UNAVAILABLE overrides, AVAILABLE overrides, minimum notice, and retake cooldown", () => {
    const interviewerId = "20000000-0000-4000-8000-000000000001";
    const now = new Date("2026-11-16T03:00:00Z"); // Monday 08:30 IST

    const slots = computeBookableSlots({
      interviewers: [
        {
          interviewer_id: interviewerId,
          display_name: "Ananya Rao",
          title: "Principal Assessor",
          bio: "Distributed systems reviewer",
          expertise_tags: ["distributed-systems"],
          default_timezone: "Asia/Kolkata",
        },
      ],
      availability: [
        {
          id: "rule-1",
          interviewer_id: interviewerId,
          day_of_week: 1, // Monday 2026-11-16
          start_time: "09:00",
          end_time: "12:00",
          timezone: "Asia/Kolkata",
          effective_from: "2026-11-01",
          effective_until: null,
        },
      ],
      overrides: [
        {
          // Block 09:55 - 10:50 IST (04:25 - 05:20 UTC)
          interviewer_id: interviewerId,
          starts_at: "2026-11-16T04:25:00Z",
          ends_at: "2026-11-16T05:20:00Z",
          kind: "UNAVAILABLE",
        },
        {
          // Extra override window on Tuesday 14:00 - 15:00 UTC
          interviewer_id: interviewerId,
          starts_at: "2026-11-17T14:00:00Z",
          ends_at: "2026-11-17T15:00:00Z",
          kind: "AVAILABLE",
        },
      ],
      busyWindows: [
        {
          // Busy at 10:50 - 11:35 IST (05:20 - 06:05 UTC)
          interviewer_id: interviewerId,
          starts_at: "2026-11-16T05:20:00Z",
          ends_at: "2026-11-16T06:05:00Z",
        },
      ],
      from: new Date("2026-11-16T00:00:00Z"),
      to: new Date("2026-11-18T00:00:00Z"),
      durationMinutes: 45,
      bufferMinutes: 10,
      minimumNoticeMinutes: 60, // Cannot start before 04:00 UTC (09:30 IST), so 09:00 IST (03:30 UTC) is excluded
      retakeAfter: new Date("2026-11-16T12:00:00Z"), // Forces Monday morning out; Tuesday override remains
      now,
    });

    // Only Tuesday override 14:00-14:45 UTC passes notice + retakeAfter
    expect(slots).toHaveLength(1);
    expect(slots[0].startsAt).toBe("2026-11-17T14:00:00.000Z");
    expect(slots[0].endsAt).toBe("2026-11-17T14:45:00.000Z");
  });
});
