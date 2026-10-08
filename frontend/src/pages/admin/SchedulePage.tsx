import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ConflictNotice } from '../../components/ConflictNotice';
import { SlotPicker, type SlotSelection } from '../../components/SlotPicker';
import { Alert, Modal, Spinner, StatusBadge } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { api, ApiError, qs } from '../../lib/api';
import { useServices, useTherapists } from '../../lib/queries';
import { addDays, fmtLongDate, fmtTime, minToHHMM, minuteOfDay, money, todayYmd, ymdParts } from '../../lib/time';
import type { Booking, BookingConflict, BookingStatus, Therapist } from '../../lib/types';

const PX_PER_MIN = 1.1;

const blockColors: Record<BookingStatus, string> = {
  PENDING: 'border-amber-400 bg-amber-50',
  CONFIRMED: 'border-forest-600 bg-forest-100',
  COMPLETED: 'border-sky-500 bg-sky-50',
  NO_SHOW: 'border-red-400 bg-red-50',
  CANCELLED: 'border-stone-300 bg-stone-100 opacity-60',
};

export function SchedulePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [date, setDate] = useState(todayYmd());
  const [showCancelled, setShowCancelled] = useState(false);
  const [selected, setSelected] = useState<Booking | null>(null);
  const [creating, setCreating] = useState(false);

  const therapistsQ = useQuery({
    queryKey: ['therapists', isAdmin ? 'admin' : 'public'],
    queryFn: () => api<Therapist[]>(isAdmin ? '/therapists/admin/all' : '/therapists'),
  });
  const bookingsQ = useQuery({
    queryKey: ['bookings', date],
    queryFn: () => api<Booking[]>(`/bookings${qs({ date })}`),
    refetchInterval: 30_000,
  });

  const weekday = ymdParts(date).isoWeekday;
  const therapists = (therapistsQ.data ?? []).filter((t) => t.active && (isAdmin || t.id === user?.therapistId));
  const bookings = (bookingsQ.data ?? []).filter((b) => showCancelled || b.status !== 'CANCELLED');

  // Visible range: earliest shift start → latest shift end that day (fallback 08:00–20:00).
  const [dayStart, dayEnd] = useMemo(() => {
    const hours = therapists.flatMap((t) => t.workingHours.filter((h) => h.dayOfWeek === weekday));
    const bookingMins = bookings.map((b) => [minuteOfDay(b.startAt), minuteOfDay(b.endAt)]);
    const lo = Math.min(8 * 60, ...hours.map((h) => h.startMin), ...bookingMins.map(([s]) => s));
    const hi = Math.max(20 * 60, ...hours.map((h) => h.endMin), ...bookingMins.map(([, e]) => e));
    return [Math.floor(lo / 60) * 60, Math.ceil(hi / 60) * 60];
  }, [therapists, bookings, weekday]);

  const active = bookings.filter((b) => b.status !== 'CANCELLED');
  const revenue = active.filter((b) => b.status !== 'NO_SHOW').reduce((s, b) => s + b.priceCents, 0);
  const working = therapists.filter((t) => t.workingHours.some((h) => h.dayOfWeek === weekday)).length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">{isAdmin ? 'Front desk' : 'My schedule'}</p>
          <h1 className="mt-1 text-4xl font-semibold">{ymdParts(date).long}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-ghost !px-3" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">‹</button>
          <button className="btn-ghost" onClick={() => setDate(todayYmd())}>Today</button>
          <button className="btn-ghost !px-3" onClick={() => setDate(addDays(date, 1))} aria-label="Next day">›</button>
          <input type="date" className="input !w-auto" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          {isAdmin && <button className="btn-gold" onClick={() => setCreating(true)}>+ New booking</button>}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Bookings" value={String(active.length)} />
        <Stat label="Expected revenue" value={money(revenue)} />
        <Stat label="Therapists working" value={`${working} / ${therapists.length}`} />
        <label className="card flex cursor-pointer items-center gap-3 p-4 text-sm">
          <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} className="h-4 w-4 accent-forest-700" />
          Show cancelled
        </label>
      </div>

      {therapistsQ.isLoading || bookingsQ.isLoading ? (
        <Spinner />
      ) : bookingsQ.error ? (
        <Alert>{(bookingsQ.error as Error).message}</Alert>
      ) : therapists.length === 0 ? (
        <Alert tone="info">No active therapists yet.</Alert>
      ) : (
        <div className="card overflow-x-auto">
          <div className="flex min-w-max">
            {/* time axis */}
            <div className="sticky left-0 z-10 w-16 shrink-0 border-r border-sand-200 bg-white">
              <div className="h-14 border-b border-sand-200" />
              <div className="relative" style={{ height: (dayEnd - dayStart) * PX_PER_MIN }}>
                {Array.from({ length: (dayEnd - dayStart) / 60 + 1 }, (_, i) => (
                  <span key={i} className="absolute right-2 -translate-y-1/2 text-[11px] text-forest-700/60" style={{ top: i * 60 * PX_PER_MIN }}>
                    {minToHHMM(dayStart + i * 60)}
                  </span>
                ))}
              </div>
            </div>

            {therapists.map((t) => {
              const shifts = t.workingHours.filter((h) => h.dayOfWeek === weekday);
              const mine = bookings.filter((b) => b.therapist.id === t.id);
              return (
                <div key={t.id} className="w-52 shrink-0 border-r border-sand-200 last:border-r-0">
                  <div className="flex h-14 flex-col justify-center border-b border-sand-200 px-3">
                    <p className="truncate text-sm font-semibold">{t.name}</p>
                    <p className="truncate text-xs text-forest-700/60">
                      {shifts.length ? shifts.map((s) => `${minToHHMM(s.startMin)}–${minToHHMM(s.endMin)}`).join(', ') : 'Off today'}
                    </p>
                  </div>
                  <div
                    className="relative bg-[repeating-linear-gradient(135deg,#f4eee4_0,#f4eee4_6px,#fbf8f3_6px,#fbf8f3_12px)]"
                    style={{ height: (dayEnd - dayStart) * PX_PER_MIN }}
                  >
                    {/* working hours = white */}
                    {shifts.map((s) => (
                      <div key={s.startMin} className="absolute inset-x-0 bg-white" style={{ top: (s.startMin - dayStart) * PX_PER_MIN, height: (s.endMin - s.startMin) * PX_PER_MIN }} />
                    ))}
                    {/* hour lines */}
                    {Array.from({ length: (dayEnd - dayStart) / 60 }, (_, i) => (
                      <div key={i} className="absolute inset-x-0 border-t border-sand-200/70" style={{ top: i * 60 * PX_PER_MIN }} />
                    ))}
                    {mine.map((b) => {
                      const s = minuteOfDay(b.startAt);
                      const e = minuteOfDay(b.endAt);
                      const buf = minuteOfDay(b.blockedUntil) - e;
                      return (
                        <button
                          key={b.id}
                          onClick={() => setSelected(b)}
                          className="absolute inset-x-1.5 text-left"
                          style={{ top: (s - dayStart) * PX_PER_MIN, height: (e - s + Math.max(buf, 0)) * PX_PER_MIN }}
                        >
                          <div className={`overflow-hidden rounded-lg border-l-4 px-2 py-1 text-xs shadow-sm transition hover:shadow ${blockColors[b.status]}`} style={{ height: (e - s) * PX_PER_MIN }}>
                            <p className="font-semibold">{fmtTime(b.startAt)} {b.client.name}</p>
                            <p className="truncate text-forest-700/70">{b.service.name}</p>
                          </div>
                          {buf > 0 && b.status !== 'CANCELLED' && (
                            <div className="mx-1 rounded-b bg-sand-200/80 text-center text-[10px] text-forest-700/50" style={{ height: buf * PX_PER_MIN }}>
                              {buf >= 15 ? 'cleanup' : ''}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selected && <BookingDetails booking={selected} onClose={() => setSelected(null)} canManage={!!user && user.role !== 'CLIENT'} />}
      {creating && <NewBookingModal initialDate={date} onClose={() => setCreating(false)} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-forest-700/60">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold">{value}</p>
    </div>
  );
}

function BookingDetails({ booking: b, onClose, canManage }: { booking: Booking; onClose: () => void; canManage: boolean }) {
  const qc = useQueryClient();
  const setStatus = useMutation({
    mutationFn: (status: BookingStatus) => api<Booking>(`/bookings/${b.id}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['availability'] });
      onClose();
    },
  });
  const activeNow = b.status === 'CONFIRMED' || b.status === 'PENDING';

  return (
    <Modal open onClose={onClose} title={b.service.name}>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2"><StatusBadge status={b.status} /><span className="text-forest-700/60">Ref {b.reference}</span></div>
        <p><span className="text-forest-700/60">When:</span> {fmtLongDate(b.startAt)}, {fmtTime(b.startAt)} – {fmtTime(b.endAt)}</p>
        <p><span className="text-forest-700/60">Therapist:</span> {b.therapist.name}</p>
        <p><span className="text-forest-700/60">Client:</span> {b.client.name} · {b.client.email}{b.client.phone ? ` · ${b.client.phone}` : ''}</p>
        <p><span className="text-forest-700/60">Price:</span> {money(b.priceCents)}</p>
        {b.notes && <p className="rounded-xl bg-sand-100 p-3"><span className="text-forest-700/60">Notes:</span> {b.notes}</p>}
      </div>
      {setStatus.error && <div className="mt-4"><Alert>{(setStatus.error as Error).message}</Alert></div>}
      {canManage && activeNow && (
        <div className="mt-6 flex flex-wrap gap-2">
          {b.status === 'PENDING' && <button className="btn-primary" onClick={() => setStatus.mutate('CONFIRMED')}>Confirm</button>}
          <button className="btn-primary" disabled={setStatus.isPending} onClick={() => setStatus.mutate('COMPLETED')}>Mark completed</button>
          <button className="btn-ghost" disabled={setStatus.isPending} onClick={() => setStatus.mutate('NO_SHOW')}>No-show</button>
          <button className="btn-danger" disabled={setStatus.isPending} onClick={() => setStatus.mutate('CANCELLED')}>Cancel booking</button>
        </div>
      )}
    </Modal>
  );
}

/** Front-desk booking for phone / walk-in clients. Same conflict protection as online booking. */
function NewBookingModal({ initialDate, onClose }: { initialDate: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: services } = useServices();
  const [guest, setGuest] = useState({ name: '', email: '', phone: '' });
  const [serviceId, setServiceId] = useState('');
  const { data: therapists } = useTherapists(serviceId || undefined);
  const [therapistId, setTherapistId] = useState('any');
  const [slot, setSlot] = useState<SlotSelection | null>(null);
  const [notes, setNotes] = useState('');
  const [conflict, setConflict] = useState<BookingConflict | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api<Booking>('/bookings', {
        body: {
          serviceId,
          startAt: slot!.start,
          therapistId: slot!.therapistId,
          notes: notes || undefined,
          guest: { name: guest.name, email: guest.email, phone: guest.phone || undefined },
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['availability'] });
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) setConflict(e.data);
    },
  });

  const ready = guest.name.length >= 2 && /\S+@\S+\.\S+/.test(guest.email) && serviceId && slot;

  return (
    <Modal open onClose={onClose} title="New booking" wide>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><label className="label">Client name</label><input className="input" value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} /></div>
        <div><label className="label">Email</label><input className="input" type="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} /></div>
        <div><label className="label">Phone</label><input className="input" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} /></div>
      </div>
      <p className="mt-1.5 text-xs text-forest-700/60">Existing clients are matched by email; new ones get an account automatically.</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Treatment</label>
          <select className="input" value={serviceId} onChange={(e) => { setServiceId(e.target.value); setTherapistId('any'); setSlot(null); }}>
            <option value="">Select…</option>
            {services?.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.durationMin} min)</option>)}
          </select>
        </div>
        <div>
          <label className="label">Therapist</label>
          <select className="input" value={therapistId} disabled={!serviceId} onChange={(e) => { setTherapistId(e.target.value); setSlot(null); }}>
            <option value="any">Any available</option>
            {therapists?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      {serviceId && (
        <div className="mt-6">
          <SlotPicker serviceId={serviceId} therapistId={therapistId} value={slot} onChange={(s) => { setSlot(s); setConflict(null); }} initialDate={initialDate < todayYmd() ? todayYmd() : initialDate} />
        </div>
      )}

      <textarea className="input mt-5 min-h-16" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />

      {conflict && slot && (
        <div className="mt-4">
          <ConflictNotice conflict={conflict} requestedStart={slot.start} therapistId={therapistId} onPick={(s) => { setSlot(s); setConflict(null); }} />
        </div>
      )}
      {create.error && !(create.error instanceof ApiError && create.error.status === 409) && (
        <div className="mt-4"><Alert>{(create.error as Error).message}</Alert></div>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-gold" disabled={!ready || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? 'Booking…' : 'Create booking'}
        </button>
      </div>
    </Modal>
  );
}
