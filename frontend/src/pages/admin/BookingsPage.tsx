import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Spinner, StatusBadge } from '../../components/ui';
import { api, qs } from '../../lib/api';
import { addDays, fmtDateTime, fmtDuration, fmtTime, money, todayYmd, ymdOf, ymdParts } from '../../lib/time';
import type { Booking, BookingStatus, Therapist } from '../../lib/types';
import { BookingDetails } from './SchedulePage';

/** Must match BookingsService.LIST_LIMIT on the API. */
const LIST_LIMIT = 2000;
const DAY_MS = 86_400_000;

// ------------------------------------------------------------------ date ranges

type Preset = 'today' | 'tomorrow' | 'thisWeek' | 'nextWeek' | 'thisMonth' | 'nextMonth' | 'next30' | 'last7' | 'custom';

const PRESETS: [Preset, string][] = [
  ['today', 'Today'],
  ['tomorrow', 'Tomorrow'],
  ['thisWeek', 'This week'],
  ['nextWeek', 'Next week'],
  ['thisMonth', 'This month'],
  ['nextMonth', 'Next month'],
  ['next30', 'Next 30 days'],
  ['last7', 'Last 7 days'],
  ['custom', 'Custom'],
];

function monthRange(ymd: string, offset: number): [string, string] {
  const [y, m] = ymd.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + offset, 1));
  const last = new Date(Date.UTC(y, m + offset, 0));
  return [first.toISOString().slice(0, 10), last.toISOString().slice(0, 10)];
}

function presetRange(p: Exclude<Preset, 'custom'>): [string, string] {
  const today = todayYmd();
  const monday = addDays(today, 1 - ymdParts(today).isoWeekday);
  switch (p) {
    case 'today': return [today, today];
    case 'tomorrow': return [addDays(today, 1), addDays(today, 1)];
    case 'thisWeek': return [monday, addDays(monday, 6)];
    case 'nextWeek': return [addDays(monday, 7), addDays(monday, 13)];
    case 'thisMonth': return monthRange(today, 0);
    case 'nextMonth': return monthRange(today, 1);
    case 'next30': return [today, addDays(today, 29)];
    case 'last7': return [addDays(today, -6), today];
  }
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;

function rangeLabel(from: string, to: string) {
  const year = (ymd: string) => ymd.slice(0, 4);
  const short = (ymd: string) => { const p = ymdParts(ymd); return `${p.weekday} ${p.day} ${p.month}`; };
  if (from === to) return `${ymdParts(from).long} ${year(from)}`;
  return `${short(from)}${year(from) === year(to) ? '' : ` ${year(from)}`} – ${short(to)} ${year(to)}`;
}

function relativeDay(ymd: string) {
  const diff = daysBetween(todayYmd(), ymd) - 1;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return `In ${diff} days`;
  if (diff < -1 && diff > -7) return `${-diff} days ago`;
  return null;
}

// ------------------------------------------------------------------ flags

type FlagTone = 'red' | 'amber' | 'gold' | 'slate';
interface Flag { key: string; label: string; tone: FlagTone; title: string }

const FLAG_STYLES: Record<FlagTone, string> = {
  red: 'bg-red-50 text-red-700 ring-red-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  gold: 'bg-gold-100 text-gold-600 ring-gold-400/40',
  slate: 'bg-sand-100 text-forest-700 ring-sand-300',
};

const isActive = (b: Booking) => b.status === 'CONFIRMED' || b.status === 'PENDING';

function flagsFor(b: Booking, now: number): Flag[] {
  const flags: Flag[] = [];
  const h = b.clientHistory;
  if (isActive(b) && Date.parse(b.endAt) < now) {
    flags.push({ key: 'unclosed', label: 'Not closed', tone: 'red', title: 'Treatment time has passed - mark it completed or no-show' });
  }
  if (b.status === 'PENDING') {
    flags.push({ key: 'pending', label: 'Awaiting confirmation', tone: 'amber', title: 'This booking has not been confirmed yet' });
  }
  if (h && h.noShow > 0) {
    flags.push({ key: 'noshow', label: `${h.noShow} prior no-show${h.noShow === 1 ? '' : 's'}`, tone: 'red', title: 'This client has missed appointments before' });
  }
  if (h && h.cancelled >= 2) {
    flags.push({ key: 'cancels', label: `${h.cancelled} cancellations`, tone: 'amber', title: 'This client cancels often' });
  }
  if (h && h.total === 1 && b.status !== 'CANCELLED') {
    flags.push({ key: 'first', label: 'First visit', tone: 'gold', title: 'This is the client\'s first booking with the spa' });
  }
  if (b.createdAt && Date.parse(b.startAt) - Date.parse(b.createdAt) < DAY_MS && b.status !== 'CANCELLED') {
    flags.push({ key: 'late', label: 'Booked < 24 h ahead', tone: 'slate', title: `Booked ${fmtDateTime(b.createdAt)}` });
  }
  if (!b.client.phone) {
    flags.push({ key: 'nophone', label: 'No phone', tone: 'slate', title: 'No phone number on file for this client' });
  }
  return flags;
}

/** Flags that mean the front desk has to do something. */
const needsAction = (flags: Flag[]) => flags.some((f) => f.key === 'unclosed' || f.key === 'pending');

function FlagChip({ flag }: { flag: Flag }) {
  return (
    <span title={flag.title} className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${FLAG_STYLES[flag.tone]}`}>
      {flag.label}
    </span>
  );
}

// ------------------------------------------------------------------ therapist colours

const THERAPIST_COLORS = ['#466a55', '#b8925a', '#5b7a99', '#9a5b6f', '#6f8a3c', '#8a6a9a', '#3f8a8a', '#a0644a'];

function useTherapistColor(therapists: Therapist[] | undefined) {
  return useMemo(() => {
    const map = new Map<string, string>();
    (therapists ?? []).forEach((t, i) => map.set(t.id, THERAPIST_COLORS[i % THERAPIST_COLORS.length]));
    return (id: string) => map.get(id) ?? '#35503f';
  }, [therapists]);
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

function Avatar({ name, color, size = 'h-8 w-8 text-xs' }: { name: string; color: string; size?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${size}`} style={{ backgroundColor: color }}>
      {initials(name)}
    </span>
  );
}

// ------------------------------------------------------------------ CSV

function csvCell(v: string | number | null | undefined) {
  let s = v == null ? '' : String(v);
  // Stop spreadsheet apps from running cell contents as formulas.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(rows: Booking[], from: string, to: string) {
  const header = [
    'Reference', 'Date', 'Start', 'End', 'Duration (min)', 'Treatment', 'Category', 'Therapist', 'Client', 'Email', 'Phone',
    'Status', 'Price', 'Notes', 'Booked at', 'Cancelled at', 'Client bookings', 'Client no-shows', 'Client cancellations',
  ];
  const lines = rows.map((b) => [
    b.reference, ymdOf(b.startAt), fmtTime(b.startAt), fmtTime(b.endAt), b.service.durationMin, b.service.name, b.service.category,
    b.therapist.name, b.client.name, b.client.email, b.client.phone, b.status, (b.priceCents / 100).toFixed(2), b.notes,
    b.createdAt ? fmtDateTime(b.createdAt) : '', b.cancelledAt ? fmtDateTime(b.cancelledAt) : '',
    b.clientHistory?.total, b.clientHistory?.noShow, b.clientHistory?.cancelled,
  ].map(csvCell).join(','));
  const blob = new Blob(['﻿' + [header.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bookings_${from}_to_${to}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ------------------------------------------------------------------ page

const STATUSES: BookingStatus[] = ['CONFIRMED', 'PENDING', 'COMPLETED', 'NO_SHOW', 'CANCELLED'];
const STATUS_LABEL: Record<BookingStatus, string> = {
  CONFIRMED: 'Confirmed', PENDING: 'Pending', COMPLETED: 'Completed', NO_SHOW: 'No-show', CANCELLED: 'Cancelled',
};
const STATUS_DOT: Record<BookingStatus, string> = {
  CONFIRMED: 'bg-forest-600', PENDING: 'bg-amber-400', COMPLETED: 'bg-sky-500', NO_SHOW: 'bg-red-500', CANCELLED: 'bg-stone-400',
};

type View = 'agenda' | 'table';
type SortKey = 'start' | 'client' | 'service' | 'therapist' | 'price' | 'status' | 'booked';

export function BookingsPage() {
  const [preset, setPreset] = useState<Preset>('thisWeek');
  const [custom, setCustom] = useState<[string, string]>(() => presetRange('thisWeek'));
  const [view, setView] = useState<View>('agenda');
  const [search, setSearch] = useState('');
  const [therapistId, setTherapistId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [statuses, setStatuses] = useState<Set<BookingStatus>>(() => new Set(STATUSES.filter((s) => s !== 'CANCELLED')));
  const [actionOnly, setActionOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'start', dir: 1 });
  const [selected, setSelected] = useState<Booking | null>(null);

  const [from, to] = useMemo(() => {
    const [a, b] = preset === 'custom' ? custom : presetRange(preset);
    return a <= b ? [a, b] : [b, a];
  }, [preset, custom]);

  const therapistsQ = useQuery({ queryKey: ['therapists', 'admin'], queryFn: () => api<Therapist[]>('/therapists/admin/all') });
  const bookingsQ = useQuery({
    queryKey: ['bookings', 'range', from, to],
    queryFn: () => api<Booking[]>(`/bookings${qs({ from, to })}`),
    refetchInterval: 60_000,
  });
  const colorOf = useTherapistColor(therapistsQ.data);

  const all = bookingsQ.data ?? [];
  const now = bookingsQ.dataUpdatedAt || Date.now();

  const flagged = useMemo(() => {
    const m = new Map<string, Flag[]>();
    for (const b of all) m.set(b.id, flagsFor(b, now));
    return m;
  }, [all, now]);

  const services = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of all) m.set(b.service.id, b.service.name);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    const filtered = all.filter((b) => {
      if (!statuses.has(b.status)) return false;
      if (therapistId && b.therapist.id !== therapistId) return false;
      if (serviceId && b.service.id !== serviceId) return false;
      if (actionOnly && !needsAction(flagged.get(b.id) ?? [])) return false;
      if (!term) return true;
      const hay = [b.client.name, b.client.email, b.reference, b.service.name, b.therapist.name, b.notes ?? ''].join(' ').toLowerCase();
      return hay.includes(term) || (digits.length >= 3 && (b.client.phone ?? '').replace(/\D/g, '').includes(digits));
    });
    const val = (b: Booking): string | number => {
      switch (sort.key) {
        case 'start': return b.startAt;
        case 'client': return b.client.name.toLowerCase();
        case 'service': return b.service.name.toLowerCase();
        case 'therapist': return b.therapist.name.toLowerCase();
        case 'price': return b.priceCents;
        case 'status': return b.status;
        case 'booked': return b.createdAt ?? '';
      }
    };
    return filtered.sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir || a.startAt.localeCompare(b.startAt);
    });
  }, [all, statuses, therapistId, serviceId, actionOnly, search, sort, flagged]);

  // Stats are computed on everything in the range (not the filters), so they always describe the whole period.
  const stats = useMemo(() => {
    const live = all.filter((b) => b.status !== 'CANCELLED');
    const earning = live.filter((b) => b.status !== 'NO_SHOW');
    const count = (s: BookingStatus) => all.filter((b) => b.status === s).length;
    const clients = new Set(live.map((b) => b.client.id));
    const firstVisits = new Set(live.filter((b) => b.clientHistory?.total === 1).map((b) => b.client.id));
    return {
      live: live.length,
      upcoming: live.filter((b) => isActive(b) && Date.parse(b.startAt) > now).length,
      revenue: earning.reduce((s, b) => s + b.priceCents, 0),
      collected: all.filter((b) => b.status === 'COMPLETED').reduce((s, b) => s + b.priceCents, 0),
      minutes: live.reduce((s, b) => s + b.service.durationMin, 0),
      clients: clients.size,
      firstVisits: firstVisits.size,
      cancelled: count('CANCELLED'),
      noShow: count('NO_SHOW'),
      action: all.filter((b) => needsAction(flagged.get(b.id) ?? [])).length,
    };
  }, [all, flagged, now]);

  const pct = (n: number) => (all.length ? `${Math.round((n / all.length) * 100)}% of all` : '—');
  const toggleStatus = (s: BookingStatus) =>
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });

  const jumpToDay = (ymd: string) => {
    setView('agenda');
    requestAnimationFrame(() => document.getElementById(`day-${ymd}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const filtersOn = search || therapistId || serviceId || actionOnly || statuses.size !== STATUSES.length - 1 || statuses.has('CANCELLED');

  return (
    <div>
      {/* ---------------------------------------------------------- header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Front desk · All bookings</p>
          <h1 className="mt-1 text-4xl font-semibold sm:text-5xl">{rangeLabel(from, to)}</h1>
          <p className="mt-2 text-sm text-forest-700/70">
            {daysBetween(from, to)} day{daysBetween(from, to) === 1 ? '' : 's'} · times shown in spa time
            {bookingsQ.dataUpdatedAt > 0 && <> · updated {fmtTime(new Date(bookingsQ.dataUpdatedAt).toISOString())}</>}
            {bookingsQ.isFetching && !bookingsQ.isLoading && <span className="ml-2 inline-block h-2 w-2 animate-pulse rounded-full bg-gold-500 align-middle" />}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => bookingsQ.refetch()} disabled={bookingsQ.isFetching}>Refresh</button>
          <button className="btn-gold" onClick={() => exportCsv(rows, from, to)} disabled={!rows.length}>
            Export CSV ({rows.length})
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------- range picker */}
      <div className="card mb-5 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                if (key === 'custom') setCustom([from, to]);
                setPreset(key);
              }}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${preset === key ? 'bg-forest-800 text-sand-50 shadow-sm' : 'text-forest-700 hover:bg-sand-100'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-sand-100 pt-3 text-sm">
            <label className="text-forest-700/70" htmlFor="range-from">From</label>
            <input id="range-from" type="date" className="input !w-auto !py-1.5" value={custom[0]} onChange={(e) => e.target.value && setCustom([e.target.value, custom[1]])} />
            <label className="text-forest-700/70" htmlFor="range-to">to</label>
            <input id="range-to" type="date" className="input !w-auto !py-1.5" value={custom[1]} onChange={(e) => e.target.value && setCustom([custom[0], e.target.value])} />
          </div>
        )}
      </div>

      {bookingsQ.isLoading ? (
        <Spinner label="Loading bookings…" />
      ) : bookingsQ.error ? (
        <Alert>{(bookingsQ.error as Error).message}</Alert>
      ) : (
        <>
          {all.length >= LIST_LIMIT && (
            <div className="mb-5"><Alert tone="warn">Showing the first {LIST_LIMIT} bookings only. Pick a shorter date range to see everything.</Alert></div>
          )}

          {/* ---------------------------------------------------------- KPIs */}
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Kpi label="Bookings" value={String(stats.live)} sub={`${stats.upcoming} still to come`} accent="bg-forest-600" />
            <Kpi label="Expected revenue" value={money(stats.revenue)} sub={`${money(stats.collected)} completed`} accent="bg-gold-500" />
            <Kpi label="Treatment hours" value={(stats.minutes / 60).toFixed(stats.minutes % 60 ? 1 : 0)} sub="booked time" accent="bg-sky-500" />
            <Kpi label="Clients" value={String(stats.clients)} sub={`${stats.firstVisits} first visit${stats.firstVisits === 1 ? '' : 's'}`} accent="bg-violet-400" />
            <Kpi label="Cancelled" value={String(stats.cancelled)} sub={pct(stats.cancelled)} accent="bg-stone-400" />
            <Kpi label="No-shows" value={String(stats.noShow)} sub={pct(stats.noShow)} accent="bg-red-500" />
            <button
              onClick={() => setActionOnly((v) => !v)}
              className={`card relative overflow-hidden p-4 text-left transition hover:shadow-md ${stats.action ? 'ring-2 ring-red-300' : ''} ${actionOnly ? 'bg-red-50' : ''}`}
              title="Pending confirmations and past bookings not yet marked completed / no-show"
            >
              <span className={`absolute inset-y-0 left-0 w-1 ${stats.action ? 'bg-red-500' : 'bg-forest-600'}`} />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-forest-700/60">Needs action</p>
              <p className={`mt-1 font-display text-3xl font-semibold ${stats.action ? 'text-red-700' : ''}`}>{stats.action}</p>
              <p className="mt-0.5 text-xs text-forest-700/60">{actionOnly ? 'Showing only these ✕' : stats.action ? 'Click to review' : 'All clear'}</p>
            </button>
          </div>

          {/* ---------------------------------------------------------- day strip + therapist load */}
          <div className="mb-5 grid items-start gap-5 lg:grid-cols-[1fr_22rem]">
            <DayStrip from={from} to={to} bookings={all} onPick={jumpToDay} />
            <TherapistLoad bookings={all} therapists={therapistsQ.data ?? []} colorOf={colorOf} days={daysBetween(from, to)} selected={therapistId} onPick={(id) => setTherapistId((cur) => (cur === id ? '' : id))} />
          </div>

          {/* ---------------------------------------------------------- filters */}
          <div className="card z-20 mb-5 p-3 sm:p-4 lg:sticky lg:top-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[14rem] flex-1">
                <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-forest-700/50" viewBox="0 0 20 20" fill="none">
                  <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <input className="input !pl-9" placeholder="Search client, email, phone, reference, notes…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select className="input !w-auto" value={therapistId} onChange={(e) => setTherapistId(e.target.value)} aria-label="Therapist">
                <option value="">All therapists</option>
                {therapistsQ.data?.map((t) => <option key={t.id} value={t.id}>{t.name}{t.active ? '' : ' (inactive)'}</option>)}
              </select>
              <select className="input !w-auto" value={serviceId} onChange={(e) => setServiceId(e.target.value)} aria-label="Treatment">
                <option value="">All treatments</option>
                {services.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
              <div className="flex rounded-full bg-sand-100 p-1">
                {(['agenda', 'table'] as View[]).map((v) => (
                  <button key={v} onClick={() => setView(v)} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold capitalize transition ${view === v ? 'bg-white text-forest-900 shadow-sm' : 'text-forest-700/70 hover:text-forest-900'}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {STATUSES.map((s) => {
                const n = all.filter((b) => b.status === s).length;
                const on = statuses.has(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleStatus(s)}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${on ? 'border-forest-800/20 bg-white text-forest-900 shadow-sm' : 'border-transparent bg-sand-100/70 text-forest-700/50 line-through'}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s]}`} />
                    {STATUS_LABEL[s]} <span className="text-forest-700/50">{n}</span>
                  </button>
                );
              })}
              <label className="ml-1 inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-forest-700">
                <input type="checkbox" className="h-3.5 w-3.5 accent-red-600" checked={actionOnly} onChange={(e) => setActionOnly(e.target.checked)} />
                Needs action only
              </label>
              <span className="ml-auto text-xs text-forest-700/60">
                Showing <b className="text-forest-900">{rows.length}</b> of {all.length}
                {filtersOn && (
                  <button
                    className="ml-2 font-semibold text-gold-600 underline underline-offset-2"
                    onClick={() => {
                      setSearch(''); setTherapistId(''); setServiceId(''); setActionOnly(false);
                      setStatuses(new Set(STATUSES.filter((s) => s !== 'CANCELLED')));
                    }}
                  >
                    Reset filters
                  </button>
                )}
              </span>
            </div>
          </div>

          {/* ---------------------------------------------------------- results */}
          {rows.length === 0 ? (
            <div className="card flex flex-col items-center px-6 py-16 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-sand-100 text-2xl">🌿</div>
              <p className="font-display text-2xl font-semibold">No bookings match</p>
              <p className="mt-1 text-sm text-forest-700/70">
                {all.length ? 'Try clearing a filter or including other statuses.' : 'Nothing is booked in this period yet.'}
              </p>
            </div>
          ) : view === 'agenda' ? (
            <Agenda rows={rows} flagged={flagged} colorOf={colorOf} now={now} onOpen={setSelected} />
          ) : (
            <BookingsTable rows={rows} flagged={flagged} colorOf={colorOf} sort={sort} onSort={(key) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))} onOpen={setSelected} />
          )}
        </>
      )}

      {selected && <BookingDetails booking={selected} onClose={() => setSelected(null)} canManage />}
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="card relative overflow-hidden p-4">
      <span className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
      <p className="text-[11px] font-semibold uppercase tracking-wider text-forest-700/60">{label}</p>
      <p className="mt-1 truncate font-display text-3xl font-semibold">{value}</p>
      <p className="mt-0.5 truncate text-xs text-forest-700/60">{sub}</p>
    </div>
  );
}

function DayStrip({ from, to, bookings, onPick }: { from: string; to: string; bookings: Booking[]; onPick: (ymd: string) => void }) {
  const days = daysBetween(from, to);
  const counts = useMemo(() => {
    const m = new Map<string, { n: number; cents: number }>();
    for (const b of bookings) {
      if (b.status === 'CANCELLED') continue;
      const d = ymdOf(b.startAt);
      const c = m.get(d) ?? { n: 0, cents: 0 };
      c.n++;
      if (b.status !== 'NO_SHOW') c.cents += b.priceCents;
      m.set(d, c);
    }
    return m;
  }, [bookings]);

  if (days > 62) {
    return (
      <div className="card flex items-center p-5 text-sm text-forest-700/70">
        The day-by-day overview is shown for ranges up to two months.
      </div>
    );
  }
  const today = todayYmd();
  const list = Array.from({ length: days }, (_, i) => addDays(from, i));
  const max = Math.max(1, ...[...counts.values()].map((c) => c.n));

  return (
    <div className="card min-w-0 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3">
        <h2 className="text-xl font-semibold">Day by day</h2>
        <span className="text-xs text-forest-700/60">Darker = busier · click a day to jump to it</span>
      </div>
      <div className={`-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:overflow-visible sm:px-0 sm:pb-0 ${days <= 7 ? 'sm:grid-cols-7' : 'sm:grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))]'}`}>
        {list.map((d) => {
          const c = counts.get(d);
          const p = ymdParts(d);
          const level = c ? c.n / max : 0;
          const past = d < today;
          return (
            <button
              key={d}
              onClick={() => c && onPick(d)}
              disabled={!c}
              title={c ? `${p.long}: ${c.n} booking${c.n === 1 ? '' : 's'}, ${money(c.cents)}` : `${p.long}: no bookings`}
              className={`group relative flex min-h-[4.5rem] w-[4.5rem] shrink-0 flex-col sm:w-auto justify-between rounded-xl border p-2 text-left transition enabled:hover:-translate-y-0.5 enabled:hover:shadow-md ${d === today ? 'border-gold-500 ring-2 ring-gold-400/40' : 'border-sand-200'} ${past ? 'opacity-60' : ''}`}
              style={{ backgroundColor: c ? `rgba(70, 106, 85, ${0.08 + level * 0.72})` : undefined }}
            >
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${level > 0.55 ? 'text-white/80' : 'text-forest-700/60'}`}>
                {d === today ? 'Today' : p.weekday}
              </span>
              <span className={`font-display text-lg leading-none font-semibold ${level > 0.55 ? 'text-white' : ''}`}>{p.day} <span className="text-xs font-sans font-normal">{p.month}</span></span>
              <span className={`text-xs font-semibold ${level > 0.55 ? 'text-white' : c ? 'text-forest-800' : 'text-forest-700/30'}`}>
                {c ? `${c.n} booked` : '—'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TherapistLoad({ bookings, therapists, colorOf, days, selected, onPick }: {
  bookings: Booking[]; therapists: Therapist[]; colorOf: (id: string) => string; days: number; selected: string; onPick: (id: string) => void;
}) {
  const rows = useMemo(() => {
    const m = new Map<string, { id: string; name: string; n: number; min: number; cents: number }>();
    for (const t of therapists.filter((t) => t.active)) m.set(t.id, { id: t.id, name: t.name, n: 0, min: 0, cents: 0 });
    for (const b of bookings) {
      if (b.status === 'CANCELLED') continue;
      const r = m.get(b.therapist.id) ?? { id: b.therapist.id, name: b.therapist.name, n: 0, min: 0, cents: 0 };
      r.n++;
      r.min += b.service.durationMin;
      if (b.status !== 'NO_SHOW') r.cents += b.priceCents;
      m.set(b.therapist.id, r);
    }
    return [...m.values()].sort((a, b) => b.min - a.min);
  }, [bookings, therapists]);

  // Capacity from each therapist's weekly hours, scaled to the range length.
  const capacity = (id: string) => {
    const t = therapists.find((x) => x.id === id);
    if (!t) return 0;
    const weekly = t.workingHours.reduce((s, h) => s + (h.endMin - h.startMin), 0);
    return (weekly / 7) * days;
  };
  const max = Math.max(1, ...rows.map((r) => r.min));

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Therapist load</h2>
        <span className="text-xs text-forest-700/60">click to filter</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-forest-700/60">No therapists yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => {
            const cap = capacity(r.id);
            const util = cap ? Math.min(100, Math.round((r.min / cap) * 100)) : null;
            return (
              <li key={r.id}>
                <button
                  onClick={() => onPick(r.id)}
                  className={`w-full rounded-xl p-1.5 text-left transition hover:bg-sand-50 ${selected === r.id ? 'bg-sand-100 ring-1 ring-forest-800/20' : ''}`}
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar name={r.name} color={colorOf(r.id)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{r.name}</span>
                        <span className="shrink-0 text-xs text-forest-700/70">{r.n} · {fmtDuration(r.min)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sand-100">
                        <div className="h-full rounded-full transition-all" style={{ width: `${(r.min / max) * 100}%`, backgroundColor: colorOf(r.id) }} />
                      </div>
                      <div className="mt-0.5 flex justify-between text-[11px] text-forest-700/60">
                        <span>{money(r.cents)}</span>
                        {util !== null && <span>{util}% of working hours</span>}
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ClientCell({ b }: { b: Booking }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-semibold">{b.client.name}</p>
      <p className="truncate text-xs">
        <a href={`mailto:${b.client.email}`} onClick={(e) => e.stopPropagation()} className="text-forest-700/70 hover:text-forest-900 hover:underline">{b.client.email}</a>
      </p>
      {b.client.phone && (
        <p className="truncate text-xs">
          <a href={`tel:${b.client.phone}`} onClick={(e) => e.stopPropagation()} className="text-forest-700/70 hover:text-forest-900 hover:underline">{b.client.phone}</a>
        </p>
      )}
    </div>
  );
}

function Agenda({ rows, flagged, colorOf, now, onOpen }: {
  rows: Booking[]; flagged: Map<string, Flag[]>; colorOf: (id: string) => string; now: number; onOpen: (b: Booking) => void;
}) {
  const groups = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of [...rows].sort((a, z) => a.startAt.localeCompare(z.startAt))) {
      const d = ymdOf(b.startAt);
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(b);
    }
    return [...m];
  }, [rows]);
  const today = todayYmd();

  return (
    <div className="space-y-6">
      {groups.map(([day, list]) => {
        const live = list.filter((b) => b.status !== 'CANCELLED');
        const rel = relativeDay(day);
        return (
          <section key={day} id={`day-${day}`} className="scroll-mt-40">
            <div className={`mb-2 flex flex-wrap items-baseline justify-between gap-2 border-b-2 pb-2 ${day === today ? 'border-gold-500' : 'border-sand-200'}`}>
              <div className="flex items-baseline gap-3">
                <h2 className="text-2xl font-semibold">{ymdParts(day).long}</h2>
                {rel && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${day === today ? 'bg-gold-500 text-forest-950' : 'bg-sand-100 text-forest-700'}`}>{rel}</span>}
              </div>
              <p className="text-sm text-forest-700/70">
                <b className="text-forest-900">{live.length}</b> booking{live.length === 1 ? '' : 's'} · {fmtDuration(live.reduce((s, b) => s + b.service.durationMin, 0))} ·{' '}
                {money(live.filter((b) => b.status !== 'NO_SHOW').reduce((s, b) => s + b.priceCents, 0))}
              </p>
            </div>
            <div className="card divide-y divide-sand-100 overflow-hidden">
              {list.map((b) => {
                const flags = flagged.get(b.id) ?? [];
                const color = colorOf(b.therapist.id);
                const inProgress = isActive(b) && Date.parse(b.startAt) <= now && Date.parse(b.endAt) > now;
                return (
                  <div
                    key={b.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpen(b)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(b))}
                    className={`group relative grid cursor-pointer gap-x-4 gap-y-2 px-4 py-3.5 transition hover:bg-sand-50 focus:bg-sand-50 focus:outline-none sm:grid-cols-[6.5rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-center ${b.status === 'CANCELLED' ? 'opacity-55' : ''} ${needsAction(flags) ? 'bg-red-50/40' : ''}`}
                  >
                    <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: color }} />
                    {/* time */}
                    <div>
                      <p className={`font-display text-xl font-semibold leading-tight ${b.status === 'CANCELLED' ? 'line-through' : ''}`}>{fmtTime(b.startAt)}</p>
                      <p className="text-xs text-forest-700/60">to {fmtTime(b.endAt)} · {fmtDuration(b.service.durationMin)}</p>
                      {inProgress && <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-forest-600"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-forest-600" />In progress</p>}
                    </div>
                    {/* client */}
                    <ClientCell b={b} />
                    {/* treatment */}
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{b.service.name}</p>
                      <p className="truncate text-xs text-forest-700/60">{b.service.category} · {money(b.priceCents)}</p>
                      {b.notes && <p className="mt-0.5 truncate text-xs italic text-forest-700/80" title={b.notes}>“{b.notes}”</p>}
                    </div>
                    {/* therapist + flags */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Avatar name={b.therapist.name} color={color} size="h-6 w-6 text-[10px]" />
                        <span className="truncate text-sm">{b.therapist.name}</span>
                      </div>
                      {flags.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{flags.map((f) => <FlagChip key={f.key} flag={f} />)}</div>}
                    </div>
                    {/* status */}
                    <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                      <StatusBadge status={b.status} />
                      <span className="font-mono text-[11px] text-forest-700/50">{b.reference}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function BookingsTable({ rows, flagged, colorOf, sort, onSort, onOpen }: {
  rows: Booking[]; flagged: Map<string, Flag[]>; colorOf: (id: string) => string;
  sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void; onOpen: (b: Booking) => void;
}) {
  const Th = ({ k, children, className = '' }: { k?: SortKey; children: ReactNode; className?: string }) => (
    <th className={`sticky top-0 z-10 bg-sand-100 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-forest-700/70 ${className}`}>
      {k ? (
        <button onClick={() => onSort(k)} className="inline-flex items-center gap-1 uppercase hover:text-forest-900">
          {children}
          <span className={sort.key === k ? 'text-forest-900' : 'opacity-30'}>{sort.key === k && sort.dir === -1 ? '▼' : '▲'}</span>
        </button>
      ) : children}
    </th>
  );

  return (
    <div className="card max-h-[75vh] overflow-auto">
      <table className="w-full min-w-[68rem] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <Th k="start">Date &amp; time</Th>
            <Th k="client">Client</Th>
            <Th k="service">Treatment</Th>
            <Th k="therapist">Therapist</Th>
            <Th k="price" className="text-right">Price</Th>
            <Th k="status">Status</Th>
            <Th>Flags</Th>
            <Th k="booked">Booked on</Th>
            <Th>Ref</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b, i) => {
            const flags = flagged.get(b.id) ?? [];
            return (
              <tr
                key={b.id}
                onClick={() => onOpen(b)}
                className={`cursor-pointer align-top transition hover:bg-gold-100/50 ${i % 2 ? 'bg-sand-50/60' : 'bg-white'} ${b.status === 'CANCELLED' ? 'opacity-55' : ''}`}
              >
                <td className="border-b border-sand-100 px-3 py-2.5 whitespace-nowrap">
                  <p className="font-semibold">{ymdParts(ymdOf(b.startAt)).weekday} {ymdParts(ymdOf(b.startAt)).day} {ymdParts(ymdOf(b.startAt)).month}</p>
                  <p className="text-xs text-forest-700/60">{fmtTime(b.startAt)}–{fmtTime(b.endAt)}</p>
                </td>
                <td className="max-w-[16rem] border-b border-sand-100 px-3 py-2.5"><ClientCell b={b} /></td>
                <td className="max-w-[14rem] border-b border-sand-100 px-3 py-2.5">
                  <p className="truncate font-medium">{b.service.name}</p>
                  <p className="text-xs text-forest-700/60">{fmtDuration(b.service.durationMin)}{b.notes ? ' · 📝 notes' : ''}</p>
                </td>
                <td className="border-b border-sand-100 px-3 py-2.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-2"><Avatar name={b.therapist.name} color={colorOf(b.therapist.id)} size="h-6 w-6 text-[10px]" />{b.therapist.name}</span>
                </td>
                <td className="border-b border-sand-100 px-3 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap">{money(b.priceCents)}</td>
                <td className="border-b border-sand-100 px-3 py-2.5"><StatusBadge status={b.status} /></td>
                <td className="max-w-[15rem] border-b border-sand-100 px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">{flags.map((f) => <FlagChip key={f.key} flag={f} />)}</div>
                </td>
                <td className="border-b border-sand-100 px-3 py-2.5 text-xs whitespace-nowrap text-forest-700/70">{b.createdAt ? fmtDateTime(b.createdAt) : '—'}</td>
                <td className="border-b border-sand-100 px-3 py-2.5 font-mono text-xs whitespace-nowrap text-forest-700/60">{b.reference}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
