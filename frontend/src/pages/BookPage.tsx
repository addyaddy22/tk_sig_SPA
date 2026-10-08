import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ConflictNotice } from '../components/ConflictNotice';
import { SlotPicker, type SlotSelection } from '../components/SlotPicker';
import { Alert, PageHeader, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, ApiError, qs } from '../lib/api';
import { useServices, useTherapists } from '../lib/queries';
import { fmtDuration, fmtLongDate, fmtTime, money } from '../lib/time';
import type { AtTimeResult, Booking, BookingConflict, RuleReason } from '../lib/types';

const DRAFT_KEY = 'tk_spa_booking_draft';

/**
 * therapist - pick a therapist, then see only the times they are free.
 * time      - pick a time, then see which qualified therapists are free for the whole treatment.
 */
type Mode = 'therapist' | 'time';

interface Draft {
  serviceId?: string;
  mode: Mode | null;
  therapistId: string | null;
  slot: SlotSelection | null;
  notes: string;
}

function loadDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveDraft(d: Draft | null) {
  try {
    if (d) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

const reasonLabel: Record<RuleReason, string> = {
  ALREADY_BOOKED: 'Booked at this time',
  OUTSIDE_WORKING_HOURS: 'Not working at this time',
  TIME_OFF: 'On a break / leave',
};

const initials = (name: string) => name.split(' ').map((p) => p[0]).join('').slice(0, 2);

export function BookPage() {
  const [params] = useSearchParams();
  const draft = loadDraft();
  const presetService = params.get('service');
  const keepDraft = !presetService || presetService === draft?.serviceId;
  const [serviceId, setServiceId] = useState<string | undefined>(presetService ?? draft?.serviceId);
  const [mode, setMode] = useState<Mode | null>(keepDraft ? (draft?.mode ?? null) : null);
  const [therapistId, setTherapistId] = useState<string | null>(keepDraft ? (draft?.therapistId ?? null) : null);
  const [slot, setSlot] = useState<SlotSelection | null>(keepDraft ? (draft?.slot ?? null) : null);
  const [notes, setNotes] = useState(draft?.notes ?? '');
  const [conflict, setConflict] = useState<BookingConflict | null>(null);
  const [done, setDone] = useState<Booking | null>(null);

  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: services, isLoading } = useServices();
  const { data: therapists } = useTherapists(serviceId);
  const service = services?.find((s) => s.id === serviceId);

  useEffect(() => saveDraft({ serviceId, mode, therapistId, slot, notes }), [serviceId, mode, therapistId, slot, notes]);

  const book = useMutation({
    mutationFn: () =>
      api<Booking>('/bookings', {
        body: { serviceId, startAt: slot!.start, therapistId: slot!.therapistId, notes: notes || undefined },
      }),
    onSuccess: (b) => {
      saveDraft(null);
      setDone(b);
      qc.invalidateQueries({ queryKey: ['availability'] });
      qc.invalidateQueries({ queryKey: ['my-bookings'] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) {
        setConflict(e.data as BookingConflict);
        qc.invalidateQueries({ queryKey: ['availability'] });
      }
    },
  });

  if (done) return <Confirmation booking={done} />;

  const reset = (next: Partial<{ mode: Mode | null; therapistId: string | null }>) => {
    if ('mode' in next) setMode(next.mode!);
    if ('therapistId' in next) setTherapistId(next.therapistId!);
    setSlot(null);
    setConflict(null);
  };
  const pickService = (id: string) => {
    setServiceId(id);
    reset({ therapistId: null });
  };
  const choose = (s: SlotSelection | null) => {
    setSlot(s);
    setConflict(null);
  };

  const therapistName = (id?: string | null) => therapists?.find((t) => t.id === id)?.name;
  const summaryTherapist = slot
    ? slot.therapistId === 'any' ? 'First available' : (therapistName(slot.therapistId) ?? '-')
    : mode === 'therapist' ? (therapistName(therapistId) ?? '-') : '-';
  const ready = !!slot && (mode === 'time' || !!therapistId);

  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
      <PageHeader eyebrow="Book online" title="Reserve your treatment" />

      {isLoading ? (
        <Spinner />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <Step n={1} title="Choose a treatment">
              <select className="input" value={serviceId ?? ''} onChange={(e) => pickService(e.target.value)}>
                <option value="" disabled>Select a treatment…</option>
                {[...new Set(services!.map((s) => s.category))].map((cat) => (
                  <optgroup key={cat} label={cat}>
                    {services!.filter((s) => s.category === cat).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {fmtDuration(s.durationMin)} · {money(s.priceCents)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {service && <p className="mt-3 text-sm text-forest-700/75">{service.description}</p>}
            </Step>

            {service && (
              <Step n={2} title="How would you like to book?">
                <div className="grid gap-3 sm:grid-cols-2">
                  <ModeCard
                    active={mode === 'therapist'}
                    onClick={() => reset({ mode: 'therapist', therapistId: null })}
                    title="Choose my therapist"
                    text="Pick who you'd like, then see only the times they're free."
                    icon={<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0" />}
                  />
                  <ModeCard
                    active={mode === 'time'}
                    onClick={() => reset({ mode: 'time', therapistId: null })}
                    title="Choose my time"
                    text="Pick when suits you, and we'll show which therapists are free."
                    icon={<><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2.5" /></>}
                  />
                </div>
              </Step>
            )}

            {/* ---------- Therapist first ---------- */}
            {service && mode === 'therapist' && (
              <>
                <Step n={3} title="Choose your therapist">
                  {therapists && therapists.length === 0 && <Alert tone="info">No therapist currently offers this treatment.</Alert>}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {therapists?.map((t) => (
                      <TherapistCard key={t.id} active={therapistId === t.id} onClick={() => reset({ therapistId: t.id })} name={t.name} subtitle={t.title ?? ''} />
                    ))}
                  </div>
                </Step>
                {therapistId && (
                  <Step n={4} title={`When is ${therapistName(therapistId) ?? 'your therapist'} free?`}>
                    <SlotPicker serviceId={service.id} therapistId={therapistId} value={slot} onChange={choose} />
                  </Step>
                )}
              </>
            )}

            {/* ---------- Time first ---------- */}
            {service && mode === 'time' && (
              <>
                <Step n={3} title="Pick a date & time">
                  <p className="-mt-2 mb-4 text-sm text-forest-700/70">
                    Showing every time at least one qualified therapist is free for the full {fmtDuration(service.durationMin)}.
                  </p>
                  <SlotPicker serviceId={service.id} therapistId="any" value={slot} onChange={choose} hideTherapistChooser />
                </Step>
                {slot && (
                  <Step n={4} title={`Who's free at ${fmtTime(slot.start)}?`}>
                    <TherapistsAtTime serviceId={service.id} start={slot.start} value={slot.therapistId} onPick={(id) => choose({ start: slot.start, therapistId: id })} />
                  </Step>
                )}
              </>
            )}
          </div>

          {/* Summary */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="card p-6">
              <h3 className="text-2xl font-semibold">Your booking</h3>
              <dl className="mt-4 space-y-3 text-sm">
                <Row label="Treatment" value={service?.name ?? '-'} />
                <Row label="Duration" value={service ? fmtDuration(service.durationMin) : '-'} />
                <Row label="Therapist" value={summaryTherapist} />
                <Row label="Date" value={slot ? fmtLongDate(slot.start) : '-'} />
                <Row label="Time" value={slot && service ? `${fmtTime(slot.start)} – ${fmtTime(new Date(Date.parse(slot.start) + service.durationMin * 60000).toISOString())}` : '-'} />
                <div className="border-t border-sand-200 pt-3">
                  <Row label="Total" value={service ? money(service.priceCents) : '-'} strong />
                </div>
              </dl>

              {slot && (
                <textarea
                  className="input mt-4 min-h-20"
                  placeholder="Anything we should know? (allergies, pressure preference…)"
                  value={notes}
                  maxLength={500}
                  onChange={(e) => setNotes(e.target.value)}
                />
              )}

              {conflict && slot && (
                <div className="mt-4">
                  <ConflictNotice
                    conflict={conflict}
                    requestedStart={slot.start}
                    therapistId={slot.therapistId}
                    onPick={(s) => {
                      if (mode === 'therapist' && s.therapistId !== 'any') setTherapistId(s.therapistId);
                      choose(s);
                    }}
                  />
                </div>
              )}
              {book.error && !(book.error instanceof ApiError && book.error.status === 409) && (
                <div className="mt-4"><Alert>{(book.error as Error).message}</Alert></div>
              )}

              {user ? (
                <button className="btn-gold mt-5 w-full !py-3" disabled={!ready || book.isPending} onClick={() => book.mutate()}>
                  {book.isPending ? 'Securing your slot…' : 'Confirm booking'}
                </button>
              ) : (
                <div className="mt-5 space-y-2">
                  <button className="btn-gold w-full !py-3" disabled={!ready} onClick={() => navigate('/login?next=/book')}>
                    Sign in to confirm
                  </button>
                  <p className="text-center text-xs text-forest-700/70">
                    New here? <Link to="/register?next=/book" className="font-semibold underline">Create an account</Link> - your selection is saved.
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

/**
 * Time-first: every therapist qualified for the treatment, checked by the server against
 * the whole required period (treatment + cleanup). Unavailable ones show why.
 */
function TherapistsAtTime({ serviceId, start, value, onPick }: { serviceId: string; start: string; value: string; onPick: (id: string) => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['availability', 'at-time', serviceId, start],
    queryFn: () => api<AtTimeResult>(`/availability/at-time${qs({ serviceId, startAt: start })}`),
    staleTime: 10_000,
  });
  if (isLoading) return <Spinner label="Checking therapists…" />;
  if (error) return <Alert>{(error as Error).message}</Alert>;
  if (!data) return null;

  const free = data.therapists.filter((t) => t.free);
  const busy = data.therapists.filter((t) => !t.free);
  const p = data.requiredPeriod;

  return (
    <div>
      <p className="-mt-2 mb-4 text-sm text-forest-700/70">
        Treatment {fmtTime(p.start)} – {fmtTime(p.end)}
        {data.service.bufferMin > 0 && <> (room reset until {fmtTime(p.blockedUntil)})</>}.
      </p>
      {free.length === 0 ? (
        <Alert tone="warn">This time has just been taken. Please pick another time.</Alert>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <TherapistCard active={value === 'any'} onClick={() => onPick('any')} name="No preference" subtitle={`Any of the ${free.length} free therapist${free.length > 1 ? 's' : ''}`} icon="★" />
          {free.map((t) => (
            <TherapistCard key={t.id} active={value === t.id} onClick={() => onPick(t.id)} name={t.name} subtitle={t.title ?? 'Available'} />
          ))}
        </div>
      )}
      {busy.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <p className="label">Not available at this time</p>
          {busy.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-xl border border-dashed border-sand-300 px-3.5 py-2 text-sm text-forest-700/60">
              <span>{t.name}</span>
              <span className="text-xs">{t.reason ? reasonLabel[t.reason] : 'Unavailable'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <h2 className="mb-4 flex items-center gap-3 text-2xl font-semibold">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest-800 font-sans text-sm text-sand-50">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ModeCard({ active, onClick, title, text, icon }: { active: boolean; onClick: () => void; title: string; text: string; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex gap-3.5 rounded-xl border p-4 text-left transition ${
        active ? 'border-forest-800 bg-forest-100 ring-1 ring-forest-800' : 'border-sand-200 bg-white hover:border-forest-600/40'
      }`}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="mt-0.5 shrink-0 text-gold-600" aria-hidden>
        {icon}
      </svg>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block text-sm text-forest-700/70">{text}</span>
      </span>
    </button>
  );
}

function TherapistCard({ active, onClick, name, subtitle, icon }: { active: boolean; onClick: () => void; name: string; subtitle: string; icon?: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition ${
        active ? 'border-forest-800 bg-forest-100 ring-1 ring-forest-800' : 'border-sand-200 bg-white hover:border-forest-600/40'
      }`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sand-200 font-display text-lg font-semibold text-forest-800">
        {icon ?? initials(name)}
      </span>
      <span>
        <span className="block text-sm font-semibold">{name}</span>
        <span className="block text-xs text-forest-700/70">{subtitle}</span>
      </span>
    </button>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-forest-700/70">{label}</dt>
      <dd className={`text-right ${strong ? 'text-lg font-semibold' : 'font-medium'}`}>{value}</dd>
    </div>
  );
}

function Confirmation({ booking }: { booking: Booking }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-forest-100">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#35503f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <h1 className="mt-6 text-5xl font-semibold">You're booked in.</h1>
      <p className="mt-3 text-forest-700/80">We look forward to welcoming you.</p>
      <div className="card mt-8 p-6 text-left text-sm">
        <p className="eyebrow">Reference {booking.reference}</p>
        <p className="mt-2 font-display text-2xl font-semibold">{booking.service.name}</p>
        <p className="mt-1 text-forest-700/80">
          {fmtLongDate(booking.startAt)} · {fmtTime(booking.startAt)} - {fmtTime(booking.endAt)}
        </p>
        <p className="mt-1 text-forest-700/80">with {booking.therapist.name}</p>
      </div>
      <div className="mt-8 flex justify-center gap-3">
        <Link to="/my-bookings" className="btn-primary">View my bookings</Link>
        <Link to="/" className="btn-ghost">Back home</Link>
      </div>
    </div>
  );
}
