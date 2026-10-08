import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Modal, Spinner } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { DAY_NAMES, fmtDateTime, hhmmToMin, minToHHMM, todayYmd, zonedToIso } from '../../lib/time';
import type { Booking, Service, Therapist, WorkingHours } from '../../lib/types';

export function TherapistsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['therapists', 'admin'], queryFn: () => api<Therapist[]>('/therapists/admin/all') });
  const [editing, setEditing] = useState<Therapist | 'new' | null>(null);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-4xl font-semibold">Therapists</h1>
        <button className="btn-gold" onClick={() => setEditing('new')}>+ Add therapist</button>
      </div>
      {isLoading && <Spinner />}
      {error && <Alert>{(error as Error).message}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        {data?.map((t) => (
          <div key={t.id} className={`card p-5 ${t.active ? '' : 'opacity-60'}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-2xl font-semibold">{t.name} {!t.active && <span className="text-sm font-sans text-stone-500">(inactive)</span>}</h3>
                <p className="text-sm text-forest-700/70">{t.title}</p>
              </div>
              <button className="btn-ghost !py-1.5" onClick={() => setEditing(t)}>Manage</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {t.services.map(({ service }) => (
                <span key={service.id} className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs">{service.name}</span>
              ))}
            </div>
            <p className="mt-3 text-xs text-forest-700/60">
              {[1, 2, 3, 4, 5, 6, 7].filter((d) => t.workingHours.some((h) => h.dayOfWeek === d)).map((d) => DAY_NAMES[d].slice(0, 3)).join(' · ') || 'No working hours set'}
            </p>
          </div>
        ))}
      </div>
      {editing && <TherapistEditor therapist={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

type Tab = 'profile' | 'services' | 'hours' | 'timeoff';

function TherapistEditor({ therapist, onClose }: { therapist: Therapist | null; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('profile');
  const [id, setId] = useState(therapist?.id);
  const tabs: [Tab, string][] = [['profile', 'Profile'], ['services', 'Treatments'], ['hours', 'Hours & daily breaks'], ['timeoff', 'Leave & time off']];

  return (
    <Modal open onClose={onClose} title={therapist ? therapist.name : 'New therapist'} wide>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            disabled={!id && k !== 'profile'}
            onClick={() => setTab(k)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold disabled:opacity-40 ${tab === k ? 'bg-forest-800 text-sand-50' : 'hover:bg-sand-100'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'profile' && <ProfileTab therapist={therapist} onSaved={(t) => { setId(t.id); if (!therapist) setTab('services'); }} />}
      {tab === 'services' && id && <ServicesTab id={id} />}
      {tab === 'hours' && id && <HoursTab id={id} />}
      {tab === 'timeoff' && id && <TimeOffTab id={id} />}
    </Modal>
  );
}

const useTherapist = (id: string) =>
  useQuery({ queryKey: ['therapist', id], queryFn: () => api<Therapist>(`/therapists/${id}`) });

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['therapists'] });
    qc.invalidateQueries({ queryKey: ['therapist'] });
    qc.invalidateQueries({ queryKey: ['availability'] });
  };
}

function ProfileTab({ therapist, onSaved }: { therapist: Therapist | null; onSaved: (t: Therapist) => void }) {
  const invalidate = useInvalidate();
  const [form, setForm] = useState({
    name: therapist?.name ?? '',
    title: therapist?.title ?? '',
    bio: therapist?.bio ?? '',
    active: therapist?.active ?? true,
    email: '',
    password: '',
  });
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { name: form.name, title: form.title || undefined, bio: form.bio || undefined, active: form.active };
      if (form.email) Object.assign(body, { email: form.email, password: form.password });
      return therapist
        ? api<Therapist>(`/therapists/${therapist.id}`, { method: 'PATCH', body })
        : api<Therapist>('/therapists', { body });
    },
    onSuccess: (t) => { invalidate(); setSaved(true); onSaved(t); },
  });
  const hasLogin = !!therapist?.user;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><label className="label">Title</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
      </div>
      <div><label className="label">Bio</label><textarea className="input min-h-20" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-forest-700" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active (bookable)</label>
      {hasLogin ? (
        <p className="text-sm text-forest-700/70">Staff login: {therapist!.user!.email}</p>
      ) : (
        <div className="rounded-xl bg-sand-50 p-4">
          <p className="label">Staff login (optional)</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input className="input" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className="input" type="password" placeholder="Password (8+ chars)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
        </div>
      )}
      {save.error && <Alert>{(save.error as Error).message}</Alert>}
      {saved && !save.isPending && !save.error && <Alert tone="success">Saved.</Alert>}
      <div className="flex justify-end"><button className="btn-primary" disabled={form.name.length < 2 || save.isPending} onClick={() => save.mutate()}>Save profile</button></div>
    </div>
  );
}

function ServicesTab({ id }: { id: string }) {
  const invalidate = useInvalidate();
  const { data: t } = useTherapist(id);
  const { data: services } = useQuery({ queryKey: ['services', 'admin'], queryFn: () => api<Service[]>('/services/admin/all?includeInactive=false') });
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const current = picked ?? new Set(t?.services.map((s) => s.service.id) ?? []);
  const save = useMutation({
    mutationFn: () => api(`/therapists/${id}/services`, { method: 'PUT', body: { serviceIds: [...current] } }),
    onSuccess: () => { invalidate(); setPicked(null); },
  });
  if (!t || !services) return <Spinner />;

  const toggle = (sid: string) => {
    const next = new Set(current);
    if (next.has(sid)) next.delete(sid);
    else next.add(sid);
    setPicked(next);
  };
  return (
    <div>
      <p className="mb-3 text-sm text-forest-700/70">Only treatments ticked here can be booked with this therapist.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {services.map((s) => (
          <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-sand-200 p-3 text-sm hover:bg-sand-50">
            <input type="checkbox" className="h-4 w-4 accent-forest-700" checked={current.has(s.id)} onChange={() => toggle(s.id)} />
            <span>{s.name} <span className="text-forest-700/50">· {s.category}</span></span>
          </label>
        ))}
      </div>
      {save.error && <div className="mt-3"><Alert>{(save.error as Error).message}</Alert></div>}
      {save.isSuccess && !picked && <div className="mt-3"><Alert tone="success">Treatments updated.</Alert></div>}
      <div className="mt-5 flex justify-end"><button className="btn-primary" disabled={!picked || save.isPending} onClick={() => save.mutate()}>Save treatments</button></div>
    </div>
  );
}

function HoursTab({ id }: { id: string }) {
  const invalidate = useInvalidate();
  const { data: t } = useTherapist(id);
  const [hours, setHours] = useState<WorkingHours[] | null>(null);
  const current = hours ?? t?.workingHours.map(({ dayOfWeek, startMin, endMin }) => ({ dayOfWeek, startMin, endMin })) ?? [];
  const save = useMutation({
    mutationFn: () =>
      api<{ warnings: { bookingsOutsideNewHours: Booking[] } }>(`/therapists/${id}/working-hours`, { method: 'PUT', body: { hours: current } }),
    onSuccess: () => { invalidate(); setHours(null); },
  });
  if (!t) return <Spinner />;

  const update = (next: WorkingHours[]) => setHours(next);
  const warnings = save.data?.warnings.bookingsOutsideNewHours ?? [];

  return (
    <div>
      <p className="mb-4 text-sm text-forest-700/70">Add one or more shifts per day. A gap between shifts (e.g. lunch) is never offered to clients.</p>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6, 7].map((d) => {
          const shifts = current.map((h, i) => ({ h, i })).filter(({ h }) => h.dayOfWeek === d);
          return (
            <div key={d} className="flex flex-wrap items-center gap-2 rounded-xl border border-sand-200 p-3">
              <span className="w-24 text-sm font-semibold">{DAY_NAMES[d]}</span>
              {shifts.length === 0 && <span className="text-sm text-forest-700/50">Off</span>}
              {shifts.map(({ h, i }) => (
                <span key={i} className="flex items-center gap-1 rounded-lg bg-sand-50 px-2 py-1">
                  <input type="time" step={900} className="rounded border border-sand-300 px-1 text-sm" value={minToHHMM(h.startMin)}
                    onChange={(e) => update(current.map((x, j) => (j === i ? { ...x, startMin: hhmmToMin(e.target.value) } : x)))} />
                  –
                  <input type="time" step={900} className="rounded border border-sand-300 px-1 text-sm" value={minToHHMM(h.endMin)}
                    onChange={(e) => update(current.map((x, j) => (j === i ? { ...x, endMin: hhmmToMin(e.target.value) } : x)))} />
                  <button className="px-1 text-red-700" aria-label="Remove shift" onClick={() => update(current.filter((_, j) => j !== i))}>×</button>
                </span>
              ))}
              <button className="ml-auto text-sm font-semibold text-forest-700 hover:underline"
                onClick={() => update([...current, { dayOfWeek: d, startMin: shifts.length ? shifts[shifts.length - 1].h.endMin + 60 : 540, endMin: shifts.length ? Math.min(shifts[shifts.length - 1].h.endMin + 240, 1440) : 1020 }])}>
                + shift
              </button>
            </div>
          );
        })}
      </div>
      {save.error && <div className="mt-3"><Alert>{(save.error as Error).message}</Alert></div>}
      {save.isSuccess && !hours && (
        <div className="mt-3">
          {warnings.length ? (
            <Alert tone="warn">
              Hours saved. {warnings.length} upcoming booking(s) now fall outside these hours and still stand - please reschedule them:
              <ul className="mt-2 list-disc pl-5">
                {warnings.map((b) => <li key={b.id}>{fmtDateTime(b.startAt)} · {b.service.name} · {b.client.name}</li>)}
              </ul>
            </Alert>
          ) : (
            <Alert tone="success">Working hours saved.</Alert>
          )}
        </div>
      )}
      <div className="mt-5 flex justify-end"><button className="btn-primary" disabled={!hours || save.isPending} onClick={() => save.mutate()}>Save hours</button></div>
    </div>
  );
}

function TimeOffTab({ id }: { id: string }) {
  const invalidate = useInvalidate();
  const { data: t } = useTherapist(id);
  const today = todayYmd();
  const [form, setForm] = useState({ startDate: today, startTime: '09:00', endDate: today, endTime: '17:00', reason: '' });
  const [clash, setClash] = useState<{ message: string; bookings: Booking[] } | null>(null);

  const add = useMutation({
    mutationFn: (force: boolean) =>
      api(`/therapists/${id}/time-off`, {
        body: {
          startAt: zonedToIso(form.startDate, form.startTime),
          endAt: zonedToIso(form.endDate, form.endTime),
          reason: form.reason || undefined,
          force,
        },
      }),
    onSuccess: () => { invalidate(); setClash(null); },
    onError: (e) => { if (e instanceof ApiError && e.status === 409) setClash(e.data); },
  });
  const remove = useMutation({
    mutationFn: (timeOffId: string) => api(`/therapists/${id}/time-off/${timeOffId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
  if (!t) return <Spinner />;

  return (
    <div>
      <p className="mb-4 text-sm text-forest-700/70">Leave, training, breaks… The therapist will not be offered to clients during time off.</p>
      <div className="grid gap-3 rounded-xl bg-sand-50 p-4 sm:grid-cols-2">
        <div>
          <label className="label">From</label>
          <div className="flex gap-2">
            <input type="date" className="input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: e.target.value > form.endDate ? e.target.value : form.endDate })} />
            <input type="time" className="input !w-32" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">Until</label>
          <div className="flex gap-2">
            <input type="date" className="input" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            <input type="time" className="input !w-32" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
          </div>
        </div>
        <input className="input sm:col-span-2" placeholder="Reason (optional)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        <div className="sm:col-span-2 flex justify-end">
          <button className="btn-primary" disabled={add.isPending} onClick={() => add.mutate(false)}>Add time off</button>
        </div>
      </div>

      {clash && (
        <div className="mt-4">
          <Alert tone="warn">
            <p className="font-semibold">{clash.message}</p>
            <ul className="mt-2 list-disc pl-5">
              {clash.bookings.map((b) => <li key={b.id}>{fmtDateTime(b.startAt)} · {b.service.name} · {b.client.name}</li>)}
            </ul>
            <button className="btn-ghost mt-3 bg-white !py-1.5" onClick={() => add.mutate(true)}>Add anyway</button>
          </Alert>
        </div>
      )}
      {add.error && !(add.error instanceof ApiError && add.error.status === 409) && <div className="mt-3"><Alert>{(add.error as Error).message}</Alert></div>}

      <div className="mt-6 space-y-2">
        <p className="label">Upcoming time off</p>
        {!t.timeOff?.length && <p className="text-sm text-forest-700/50">None scheduled.</p>}
        {t.timeOff?.map((o) => (
          <div key={o.id} className="flex items-center justify-between rounded-xl border border-sand-200 p-3 text-sm">
            <span>{fmtDateTime(o.startAt)} → {fmtDateTime(o.endAt)} {o.reason && <span className="text-forest-700/60">· {o.reason}</span>}</span>
            <button className="text-red-700 hover:underline" onClick={() => remove.mutate(o.id)}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}
