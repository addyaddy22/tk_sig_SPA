import { checkSlot, freeStarts, pickLeastBusy, TherapistDay } from './slot-engine';

const MIN = 60_000;
const at = (h: number, m = 0) => (h * 60 + m) * MIN; // origin = midnight = 0

const baseOpts = { stepMs: 15 * MIN, gridOrigin: 0, notBefore: 0 };

describe('slot engine', () => {
  const day: TherapistDay = {
    shifts: [{ start: at(9), end: at(17) }],
    timeOff: [{ start: at(13), end: at(14) }], // lunch
    bookings: [{ start: at(10), end: at(11, 15) }], // 60 min + 15 buffer
  };
  const sixty = { durationMs: 60 * MIN, blockMs: 75 * MIN };

  it('accepts a slot that is free', () => {
    expect(checkSlot(day, at(11, 15), sixty.durationMs, sixty.blockMs)).toBeNull();
  });

  it('rejects a slot that overlaps an existing booking', () => {
    expect(checkSlot(day, at(10, 30), sixty.durationMs, sixty.blockMs)).toBe('ALREADY_BOOKED');
  });

  it('rejects a slot that starts during the previous booking cleanup buffer', () => {
    expect(checkSlot(day, at(11), sixty.durationMs, sixty.blockMs)).toBe('ALREADY_BOOKED');
  });

  it('rejects a slot whose own cleanup buffer would run into the next booking', () => {
    // 09:00 + 60 min + 15 min buffer = blocked until 10:15, but the next booking starts at 10:00
    expect(checkSlot(day, at(9), sixty.durationMs, sixty.blockMs)).toBe('ALREADY_BOOKED');
    // 45 min treatment + 15 buffer fits exactly before 10:00
    expect(checkSlot(day, at(9), 45 * MIN, 60 * MIN)).toBeNull();
  });

  it('rejects slots outside working hours or during time off', () => {
    expect(checkSlot(day, at(8), sixty.durationMs, sixty.blockMs)).toBe('OUTSIDE_WORKING_HOURS');
    expect(checkSlot(day, at(16, 30), sixty.durationMs, sixty.blockMs)).toBe('OUTSIDE_WORKING_HOURS');
    expect(checkSlot(day, at(12, 30), sixty.durationMs, sixty.blockMs)).toBe('TIME_OFF');
  });

  it('allows the last treatment to end exactly at closing (buffer may run past)', () => {
    expect(checkSlot(day, at(16), sixty.durationMs, sixty.blockMs)).toBeNull();
  });

  it('lists all free starts on the grid', () => {
    const starts = freeStarts(day, { ...baseOpts, ...sixty }).map((s) => s / MIN / 60);
    expect(starts).toEqual([
      11.25, 11.5, 11.75, 12, // after the 10:00 booking + buffer, before lunch
      14, 14.25, 14.5, 14.75, 15, 15.25, 15.5, 15.75, 16,
    ]);
  });

  it('respects notBefore (lead time) and aligns to the grid', () => {
    const starts = freeStarts(day, { ...baseOpts, ...sixty, notBefore: at(14, 5) });
    expect(starts[0]).toBe(at(14, 15));
  });

  it('never produces overlapping bookings when slots are taken greedily', () => {
    const d: TherapistDay = { shifts: [{ start: at(9), end: at(18) }], timeOff: [], bookings: [] };
    const o = { ...baseOpts, durationMs: 90 * MIN, blockMs: 105 * MIN };
    let next: number | undefined;
    while ((next = freeStarts(d, o)[0]) !== undefined) {
      d.bookings.push({ start: next, end: next + o.blockMs });
    }
    const sorted = [...d.bookings].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].start).toBeGreaterThanOrEqual(sorted[i - 1].end);
    expect(sorted.length).toBe(5); // 9:00, 10:45, 12:30, 14:15, 16:00
  });

  it('auto-assigns the least busy therapist', () => {
    const mk = (name: string, n: number) => ({
      name,
      day: { shifts: [], timeOff: [], bookings: Array.from({ length: n }, () => ({ start: 0, end: 1 })) },
    });
    expect(pickLeastBusy([mk('Zoe', 3), mk('Amy', 1), mk('Bea', 1)])?.name).toBe('Amy');
  });
});
