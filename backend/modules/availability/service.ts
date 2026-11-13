export type AvailabilityWindow = { start: Date; end: Date };
export function windowsOverlap(a: AvailabilityWindow, b: AvailabilityWindow) { return a.start < b.end && b.start < a.end; }
export function generateSlots(window: AvailabilityWindow, durationMinutes: number, bufferMinutes: number, busy: AvailabilityWindow[]): AvailabilityWindow[] {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 180 || bufferMinutes < 0) throw new Error("Invalid duration or buffer");
  const slots: AvailabilityWindow[] = []; const stride = (durationMinutes + bufferMinutes) * 60_000;
  for (let start = window.start.getTime(); start + durationMinutes * 60_000 <= window.end.getTime(); start += stride) { const candidate = { start: new Date(start), end: new Date(start + durationMinutes * 60_000) }; if (!busy.some((b) => windowsOverlap(candidate, b))) slots.push(candidate); }
  return slots;
}
