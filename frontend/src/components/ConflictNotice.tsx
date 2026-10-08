import { fmtDateTime, fmtTime } from '../lib/time';
import type { BookingConflict, TherapistRef } from '../lib/types';
import type { SlotSelection } from './SlotPicker';

/**
 * Shown when the server refuses a booking (409). Explains why and offers one-click
 * alternatives: other therapists free at the same time, and the nearest free times.
 */
export function ConflictNotice({
  conflict,
  requestedStart,
  therapistId,
  onPick,
}: {
  conflict: BookingConflict;
  requestedStart: string;
  therapistId: string;
  onPick: (s: SlotSelection) => void;
}) {
  const alt = conflict.alternatives;
  const others: TherapistRef[] = alt?.freeTherapistsAtRequestedTime ?? [];
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950" role="alert">
      <p className="font-semibold">{conflict.message}</p>
      {others.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-amber-900/80">Free at {fmtTime(requestedStart)} instead:</p>
          <div className="flex flex-wrap gap-2">
            {others.map((t) => (
              <button key={t.id} className="btn-ghost bg-white !py-1.5" onClick={() => onPick({ start: requestedStart, therapistId: t.id })}>
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {alt && alt.nearestSlots.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-amber-900/80">Nearest available times{therapistId !== 'any' ? ' with your therapist' : ''}:</p>
          <div className="flex flex-wrap gap-2">
            {alt.nearestSlots.map((s) => (
              <button key={s.start} className="btn-ghost bg-white !py-1.5" onClick={() => onPick({ start: s.start, therapistId })}>
                {fmtDateTime(s.start)}
              </button>
            ))}
          </div>
        </div>
      )}
      {alt && !others.length && !alt.nearestSlots.length && (
        <p className="mt-2">No nearby openings found - please try a different day.</p>
      )}
    </div>
  );
}
