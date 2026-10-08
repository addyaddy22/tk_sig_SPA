import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ConflictNotice } from '../components/ConflictNotice';
import { SlotPicker, type SlotSelection } from '../components/SlotPicker';
import { Alert, Modal, PageHeader, Spinner, StatusBadge } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { fmtLongDate, fmtTime, money } from '../lib/time';
import type { Booking, BookingConflict } from '../lib/types';

const isUpcoming = (b: Booking) => ['PENDING', 'CONFIRMED'].includes(b.status) && new Date(b.startAt) > new Date();

export function MyBookingsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['my-bookings'], queryFn: () => api<Booking[]>('/bookings/me') });
  const [rescheduling, setRescheduling] = useState<Booking | null>(null);

  const upcoming = (data ?? []).filter(isUpcoming).sort((a, b) => a.startAt.localeCompare(b.startAt));
  const past = (data ?? []).filter((b) => !isUpcoming(b));

  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <PageHeader eyebrow="Your account" title="My bookings" />
      {isLoading && <Spinner />}
      {error && <Alert>{(error as Error).message}</Alert>}

      {data && (
        <>
          <h2 className="mb-4 text-2xl font-semibold">Upcoming</h2>
          {upcoming.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-forest-700/80">No upcoming treatments.</p>
              <Link to="/book" className="btn-primary mt-4">Book a treatment</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {upcoming.map((b) => (
                <BookingRow key={b.id} booking={b} onReschedule={() => setRescheduling(b)} />
              ))}
            </div>
          )}

          {past.length > 0 && (
            <>
              <h2 className="mb-4 mt-12 text-2xl font-semibold">History</h2>
              <div className="space-y-3">
                {past.map((b) => <BookingRow key={b.id} booking={b} />)}
              </div>
            </>
          )}
        </>
      )}

      {rescheduling && <RescheduleModal booking={rescheduling} onClose={() => setRescheduling(null)} />}
    </div>
  );
}

function BookingRow({ booking: b, onReschedule }: { booking: Booking; onReschedule?: () => void }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const cancel = useMutation({
    mutationFn: () => api<Booking>(`/bookings/${b.id}/cancel`, { method: 'PATCH' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-bookings'] });
      qc.invalidateQueries({ queryKey: ['availability'] });
    },
  });

  return (
    <div className={`card p-5 ${onReschedule ? '' : 'opacity-80'}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-2xl font-semibold">{b.service.name}</h3>
            <StatusBadge status={b.status} />
          </div>
          <p className="mt-1 text-sm text-forest-700/80">
            {fmtLongDate(b.startAt)} · {fmtTime(b.startAt)} - {fmtTime(b.endAt)} · with {b.therapist.name}
          </p>
          <p className="mt-1 text-xs text-forest-700/60">Ref {b.reference} · {money(b.priceCents)}</p>
        </div>
        {onReschedule && (
          <div className="flex gap-2">
            {confirming ? (
              <>
                <button className="btn-danger !py-2" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                  {cancel.isPending ? 'Cancelling…' : 'Yes, cancel'}
                </button>
                <button className="btn-ghost !py-2" onClick={() => setConfirming(false)}>Keep</button>
              </>
            ) : (
              <>
                <button className="btn-ghost !py-2" onClick={onReschedule}>Reschedule</button>
                <button className="btn-danger !py-2" onClick={() => setConfirming(true)}>Cancel</button>
              </>
            )}
          </div>
        )}
      </div>
      {cancel.error && <div className="mt-3"><Alert>{(cancel.error as Error).message}</Alert></div>}
    </div>
  );
}

function RescheduleModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const qc = useQueryClient();
  const [therapistId, setTherapistId] = useState(booking.therapist.id);
  const [slot, setSlot] = useState<SlotSelection | null>(null);
  const [conflict, setConflict] = useState<BookingConflict | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api<Booking>(`/bookings/${booking.id}/reschedule`, {
        method: 'PATCH',
        body: { startAt: slot!.start, therapistId: slot!.therapistId },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-bookings'] });
      qc.invalidateQueries({ queryKey: ['availability'] });
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) setConflict(e.data);
    },
  });

  return (
    <Modal open onClose={onClose} title={`Reschedule ${booking.service.name}`} wide>
      <div className="mb-5 flex flex-wrap gap-2 text-sm">
        <button
          className={`rounded-full border px-3.5 py-1.5 ${therapistId === booking.therapist.id ? 'border-forest-800 bg-forest-800 text-sand-50' : 'border-sand-300'}`}
          onClick={() => { setTherapistId(booking.therapist.id); setSlot(null); }}
        >
          Keep {booking.therapist.name}
        </button>
        <button
          className={`rounded-full border px-3.5 py-1.5 ${therapistId === 'any' ? 'border-forest-800 bg-forest-800 text-sand-50' : 'border-sand-300'}`}
          onClick={() => { setTherapistId('any'); setSlot(null); }}
        >
          Any therapist
        </button>
      </div>
      <SlotPicker serviceId={booking.service.id} therapistId={therapistId} value={slot} onChange={(s) => { setSlot(s); setConflict(null); }} />
      {conflict && slot && (
        <div className="mt-4">
          <ConflictNotice conflict={conflict} requestedStart={slot.start} therapistId={therapistId} onPick={(s) => { setSlot(s); setConflict(null); }} />
        </div>
      )}
      {save.error && !(save.error instanceof ApiError && save.error.status === 409) && (
        <div className="mt-4"><Alert>{(save.error as Error).message}</Alert></div>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <button className="btn-ghost" onClick={onClose}>Close</button>
        <button className="btn-gold" disabled={!slot || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Moving…' : slot ? `Move to ${fmtTime(slot.start)}` : 'Pick a time'}
        </button>
      </div>
    </Modal>
  );
}
