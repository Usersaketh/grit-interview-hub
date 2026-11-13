export type AvailabilityWindow = { start: Date; end: Date };

export type RecurringAvailabilityRule = {
  id: string;
  interviewer_id: string;
  day_of_week: number;
  start_time: string; // HH:MM
  end_time: string;   // HH:MM
  timezone: string;
  effective_from: string; // YYYY-MM-DD
  effective_until: string | null;
};

export type AvailabilityOverrideRecord = {
  interviewer_id: string;
  starts_at: string;
  ends_at: string;
  kind: "AVAILABLE" | "UNAVAILABLE";
};

export type BusyWindowRecord = {
  interviewer_id: string;
  starts_at: string;
  ends_at: string;
};

export type InterviewerSummary = {
  interviewer_id: string;
  display_name: string;
  title: string;
  bio: string | null;
  expertise_tags: string[];
  default_timezone: string;
};

export type BookableSlot = {
  interviewerId: string;
  interviewerName: string;
  interviewerTitle: string;
  interviewerTimezone: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
};

export function windowsOverlap(a: AvailabilityWindow, b: AvailabilityWindow) {
  return a.start < b.end && b.start < a.end;
}

export function generateSlots(
  window: AvailabilityWindow,
  durationMinutes: number,
  bufferMinutes: number,
  busy: AvailabilityWindow[]
): AvailabilityWindow[] {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 180 || bufferMinutes < 0) {
    throw new Error("Invalid duration or buffer");
  }
  const slots: AvailabilityWindow[] = [];
  const stride = (durationMinutes + bufferMinutes) * 60_000;
  for (let start = window.start.getTime(); start + durationMinutes * 60_000 <= window.end.getTime(); start += stride) {
    const candidate = { start: new Date(start), end: new Date(start + durationMinutes * 60_000) };
    if (!busy.some((b) => windowsOverlap(candidate, b))) {
      slots.push(candidate);
    }
  }
  return slots;
}

function getZonedParts(epochMs: number, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(new Date(epochMs));
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") lookup[part.type] = part.value;
  }
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
    dayOfWeek: weekdayMap[lookup.weekday] ?? 0,
    dateStr: `${lookup.year}-${lookup.month}-${lookup.day}`,
  };
}

/**
 * Resolves the UTC Date for a calendar date (YYYY-MM-DD) + wall-clock HH:MM in an IANA timezone,
 * handling DST boundaries cleanly via two-step iterative offset convergence.
 */
export function zonedWallClockToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  let guess = targetAsUtc;
  for (let i = 0; i < 3; i += 1) {
    const actual = getZonedParts(guess, timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      0
    );
    const diff = targetAsUtc - actualAsUtc;
    if (diff === 0) break;
    guess += diff;
  }

  return new Date(guess);
}

function addDaysToYmd(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export type ComputeBookableSlotsInput = {
  interviewers: InterviewerSummary[];
  availability: RecurringAvailabilityRule[];
  overrides: AvailabilityOverrideRecord[];
  busyWindows: BusyWindowRecord[];
  from: Date;
  to: Date;
  durationMinutes?: number;
  bufferMinutes?: number;
  minimumNoticeMinutes?: number;
  retakeAfter?: Date | null;
  now?: Date;
};

export function computeBookableSlots(input: ComputeBookableSlotsInput): BookableSlot[] {
  const durationMinutes = input.durationMinutes ?? 45;
  const bufferMinutes = input.bufferMinutes ?? 10;
  const minimumNoticeMinutes = input.minimumNoticeMinutes ?? 60;
  const now = input.now ?? new Date();
  const minStartMs = Math.max(
    input.from.getTime(),
    now.getTime() + minimumNoticeMinutes * 60_000,
    input.retakeAfter ? input.retakeAfter.getTime() : 0
  );
  const maxEndMs = input.to.getTime();

  const slots: BookableSlot[] = [];
  const seenKeys = new Set<string>();

  for (const interviewer of input.interviewers) {
    const rules = input.availability.filter((a) => a.interviewer_id === interviewer.interviewer_id);
    const overrides = input.overrides.filter((o) => o.interviewer_id === interviewer.interviewer_id);
    const busyBookings: AvailabilityWindow[] = input.busyWindows
      .filter((b) => b.interviewer_id === interviewer.interviewer_id)
      .map((b) => ({ start: new Date(b.starts_at), end: new Date(b.ends_at) }));

    const unavailableOverrides: AvailabilityWindow[] = overrides
      .filter((o) => o.kind === "UNAVAILABLE")
      .map((o) => ({ start: new Date(o.starts_at), end: new Date(o.ends_at) }));

    const blockedWindows = [...busyBookings, ...unavailableOverrides];
    const openWindows: AvailabilityWindow[] = [];

    for (const rule of rules) {
      const tz = rule.timezone || interviewer.default_timezone || "UTC";
      const startYmd = getZonedParts(input.from.getTime() - 24 * 3600_000, tz).dateStr;
      const endYmd = getZonedParts(input.to.getTime() + 24 * 3600_000, tz).dateStr;

      let cursorYmd = startYmd;
      let guard = 0;
      while (cursorYmd <= endYmd && guard < 60) {
        guard += 1;
        if (
          cursorYmd >= rule.effective_from &&
          (!rule.effective_until || cursorYmd <= rule.effective_until)
        ) {
          const middayUtc = zonedWallClockToUtc(cursorYmd, "12:00", tz);
          const dow = getZonedParts(middayUtc.getTime(), tz).dayOfWeek;
          if (dow === rule.day_of_week) {
            const winStart = zonedWallClockToUtc(cursorYmd, rule.start_time.slice(0, 5), tz);
            const winEnd = zonedWallClockToUtc(cursorYmd, rule.end_time.slice(0, 5), tz);
            if (winEnd > winStart && winEnd.getTime() > minStartMs && winStart.getTime() < maxEndMs) {
              openWindows.push({ start: winStart, end: winEnd });
            }
          }
        }
        cursorYmd = addDaysToYmd(cursorYmd, 1);
      }
    }

    for (const o of overrides) {
      if (o.kind === "AVAILABLE") {
        const winStart = new Date(o.starts_at);
        const winEnd = new Date(o.ends_at);
        if (winEnd > winStart && winEnd.getTime() > minStartMs && winStart.getTime() < maxEndMs) {
          openWindows.push({ start: winStart, end: winEnd });
        }
      }
    }

    for (const win of openWindows) {
      const candidates = generateSlots(win, durationMinutes, bufferMinutes, blockedWindows);
      for (const candidate of candidates) {
        const startMs = candidate.start.getTime();
        const endMs = candidate.end.getTime();
        if (startMs < minStartMs || endMs > maxEndMs) continue;

        const key = `${interviewer.interviewer_id}:${candidate.start.toISOString()}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        slots.push({
          interviewerId: interviewer.interviewer_id,
          interviewerName: interviewer.display_name,
          interviewerTitle: interviewer.title,
          interviewerTimezone: interviewer.default_timezone,
          startsAt: candidate.start.toISOString(),
          endsAt: candidate.end.toISOString(),
          durationMinutes,
        });
      }
    }
  }

  slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.interviewerName.localeCompare(b.interviewerName));
  return slots;
}
