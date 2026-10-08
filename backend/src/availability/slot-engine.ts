/**
 * Pure scheduling logic - no database, no framework. All times are epoch milliseconds
 * and all intervals are half-open: [start, end).
 *
 * Model of a therapist's day:
 *   shifts   - when they are working (from weekly WorkingHours)
 *   timeOff  - leave, breaks, training...
 *   bookings - existing active bookings, as [startAt, blockedUntil) i.e. including cleanup buffer
 *
 * A new booking starting at `s` is valid when:
 *   - the treatment [s, s + duration) fits entirely inside one shift
 *   - the treatment does not touch any time off
 *   - the blocked window [s, s + duration + buffer) does not overlap any existing booking's
 *     blocked window. (Same rule the PostgreSQL exclusion constraint enforces.)
 */

export interface Interval {
  start: number;
  end: number;
}

export interface TherapistDay {
  shifts: Interval[];
  timeOff: Interval[];
  bookings: Interval[];
}

export type SlotRejection = 'OUTSIDE_WORKING_HOURS' | 'TIME_OFF' | 'ALREADY_BOOKED';

export const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

export function checkSlot(
  day: TherapistDay,
  start: number,
  durationMs: number,
  blockMs: number,
): SlotRejection | null {
  const treatment = { start, end: start + durationMs };
  if (!day.shifts.some((s) => s.start <= treatment.start && treatment.end <= s.end)) {
    return 'OUTSIDE_WORKING_HOURS';
  }
  if (day.timeOff.some((t) => overlaps(t, treatment))) return 'TIME_OFF';
  const blocked = { start, end: start + blockMs };
  if (day.bookings.some((b) => overlaps(b, blocked))) return 'ALREADY_BOOKED';
  return null;
}

export interface SlotOptions {
  stepMs: number;
  durationMs: number;
  blockMs: number;
  /** Slots are aligned to multiples of stepMs from this instant (local midnight). */
  gridOrigin: number;
  /** Earliest bookable start (now + lead time). */
  notBefore: number;
}

/** Every valid start time on the grid for one therapist's day, ascending. */
export function freeStarts(day: TherapistDay, o: SlotOptions): number[] {
  const out = new Set<number>();
  for (const shift of day.shifts) {
    const firstIdx = Math.ceil((Math.max(shift.start, o.notBefore) - o.gridOrigin) / o.stepMs);
    for (let s = o.gridOrigin + firstIdx * o.stepMs; s + o.durationMs <= shift.end; s += o.stepMs) {
      if (checkSlot(day, s, o.durationMs, o.blockMs) === null) out.add(s);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** Pick the therapist to auto-assign: fewest bookings that day, then name for stability. */
export function pickLeastBusy<T extends { name: string; day: TherapistDay }>(candidates: T[]): T | undefined {
  return [...candidates].sort(
    (a, b) => a.day.bookings.length - b.day.bookings.length || a.name.localeCompare(b.name),
  )[0];
}
