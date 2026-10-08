import { useEffect, useMemo, useState } from 'react';
import { useAvailability, useConfig } from '../lib/queries';
import { addDays, fmtDate, fmtTime, minuteOfDay, todayYmd, ymdOf, ymdParts } from '../lib/time';
import type { Slot, TherapistRef } from '../lib/types';
import { Alert, Spinner } from './ui';

export interface SlotSelection {
  start: string;
  /** Specific therapist id, or 'any' to let the system assign one. */
  therapistId: string;
}

interface Props {
  serviceId: string;
  /** 'any' shows every slot where at least one therapist is free. */
  therapistId: string;
  value: SlotSelection | null;
  onChange: (value: SlotSelection | null) => void;
  /** Start the date strip on this day (YYYY-MM-DD). */
  initialDate?: string;
  /** Time-first booking shows its own therapist panel instead of the quick chips. */
  hideTherapistChooser?: boolean;
}

const STRIP = 7;

/**
 * Date strip + live time slots. Only slots that are genuinely free are ever offered, and
 * in "any therapist" mode the client can see exactly who is free at each time.
 */
export function SlotPicker({ serviceId, therapistId, value, onChange, initialDate, hideTherapistChooser }: Props) {
  const { data: config } = useConfig();
  const today = todayYmd();
  const [date, setDate] = useState(initialDate ?? (value ? ymdOf(value.start) : today));
  const [stripStart, setStripStart] = useState(date);
  const { data, isLoading, error, isFetching } = useAvailability(serviceId, date, therapistId);

  // If the chosen slot disappears (someone else booked it), clear it.
  useEffect(() => {
    if (!value || !data || ymdOf(value.start) !== date) return;
    const slot = data.slots.find((s) => s.start === value.start);
    const stillFree = slot && (value.therapistId === 'any' || slot.therapistIds.includes(value.therapistId));
    if (!stillFree) onChange(null);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = Array.from({ length: STRIP }, (_, i) => addDays(stripStart, i));
  const maxDay = addDays(today, config?.horizonDays ?? 60);
  const jumpTo = (d: string) => {
    setDate(d);
    setStripStart(d);
  };
  const byId = useMemo(() => new Map((data?.therapists ?? []).map((t) => [t.id, t])), [data]);

  const groups = useMemo(() => {
    const g: Record<'Morning' | 'Afternoon' | 'Evening', Slot[]> = { Morning: [], Afternoon: [], Evening: [] };
    for (const s of data?.slots ?? []) {
      const m = minuteOfDay(s.start);
      (m < 12 * 60 ? g.Morning : m < 17 * 60 ? g.Afternoon : g.Evening).push(s);
    }
    return g;
  }, [data]);

  const selectedSlot = value && data?.slots.find((s) => s.start === value.start);

  return (
    <div>
      {/* Date strip */}
      <div className="flex items-center gap-2">
        <button
          className="rounded-full p-2 text-forest-700 hover:bg-sand-100 disabled:opacity-30"
          disabled={stripStart <= today}
          onClick={() => setStripStart(addDays(stripStart, -STRIP) < today ? today : addDays(stripStart, -STRIP))}
          aria-label="Earlier dates"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12.5 15l-5-5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div className="grid flex-1 grid-cols-7 gap-1.5">
          {days.map((d) => {
            const p = ymdParts(d);
            const active = d === date;
            const disabled = d > maxDay;
            return (
              <button
                key={d}
                disabled={disabled}
                onClick={() => setDate(d)}
                className={`flex flex-col items-center rounded-xl border py-2 text-center transition ${
                  active
                    ? 'border-forest-800 bg-forest-800 text-sand-50'
                    : 'border-sand-200 bg-white hover:border-forest-600/40 disabled:opacity-30'
                }`}
              >
                <span className="text-[11px] font-medium uppercase tracking-wide opacity-70">{p.weekday}</span>
                <span className="text-lg font-semibold leading-tight">{p.day}</span>
                <span className="text-[11px] opacity-70">{p.month}</span>
              </button>
            );
          })}
        </div>
        <button
          className="rounded-full p-2 text-forest-700 hover:bg-sand-100 disabled:opacity-30"
          disabled={addDays(stripStart, STRIP) > maxDay}
          onClick={() => setStripStart(addDays(stripStart, STRIP))}
          aria-label="Later dates"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M7.5 5l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>

      <div className="mt-6 min-h-40">
        <p className="mb-4 flex items-center gap-2 text-sm text-forest-700/80">
          {ymdParts(date).long}
          {isFetching && !isLoading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-forest-600/30 border-t-forest-600" />}
        </p>
        {isLoading ? (
          <Spinner label="Checking who's free…" />
        ) : error ? (
          <Alert>{(error as Error).message}</Alert>
        ) : !data?.slots.length ? (
          <div className="space-y-3">
            <Alert tone="info">
              No free times on this day{therapistId !== 'any' ? ' for this therapist' : ''}.
              {!data?.nextAvailable && ' Try another date.'}
            </Alert>
            {data?.nextAvailable && (
              <button className="btn-ghost" onClick={() => jumpTo(data.nextAvailable!.date)}>
                Next available: {fmtDate(data.nextAvailable.start)} from {fmtTime(data.nextAvailable.start)} →
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {(Object.keys(groups) as (keyof typeof groups)[]).map((g) =>
              groups[g].length ? (
                <div key={g}>
                  <p className="label">{g}</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                    {groups[g].map((s) => {
                      const active = value?.start === s.start;
                      return (
                        <button
                          key={s.start}
                          onClick={() => onChange({ start: s.start, therapistId })}
                          className={`rounded-xl border px-2 py-2.5 text-sm font-semibold transition ${
                            active
                              ? 'border-gold-500 bg-gold-100 text-forest-900 ring-2 ring-gold-400/50'
                              : 'border-sand-200 bg-white hover:border-forest-600/40 hover:bg-sand-50'
                          }`}
                        >
                          {fmtTime(s.start)}
                          {therapistId === 'any' && (
                            <span className="mt-0.5 block text-[11px] font-normal text-forest-700/60">
                              {s.therapistIds.length} free
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null,
            )}
          </div>
        )}
      </div>

      {/* In "any" mode, show who is free at the chosen time and let the client pick. */}
      {therapistId === 'any' && !hideTherapistChooser && selectedSlot && (
        <FreeTherapists
          therapists={selectedSlot.therapistIds.map((id) => byId.get(id)!).filter(Boolean)}
          value={value!.therapistId}
          onPick={(id) => onChange({ start: selectedSlot.start, therapistId: id })}
        />
      )}
    </div>
  );
}

function FreeTherapists({ therapists, value, onPick }: { therapists: TherapistRef[]; value: string; onPick: (id: string) => void }) {
  return (
    <div className="mt-6 rounded-2xl border border-sand-200 bg-sand-50 p-4">
      <p className="label">Free at this time</p>
      <div className="flex flex-wrap gap-2">
        <Chip active={value === 'any'} onClick={() => onPick('any')}>
          No preference
        </Chip>
        {therapists.map((t) => (
          <Chip key={t.id} active={value === t.id} onClick={() => onPick(t.id)}>
            {t.name}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
        active ? 'border-forest-800 bg-forest-800 text-sand-50' : 'border-sand-300 bg-white hover:border-forest-600/40'
      }`}
    >
      {children}
    </button>
  );
}
