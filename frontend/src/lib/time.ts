/**
 * All times are shown in the spa's timezone (from /api/config), not the visitor's,
 * so a client abroad sees the same 10:00 the therapist sees.
 */
let TZ = 'Africa/Harare';
let CURRENCY = 'USD';

export function configureLocale(timezone: string, currency: string) {
  TZ = timezone;
  CURRENCY = currency;
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts });

export const fmtTime = (iso: string) => fmt({ hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
export const fmtDate = (iso: string) => fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso));
export const fmtLongDate = (iso: string) =>
  fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
export const fmtDateTime = (iso: string) => `${fmtDate(iso)}, ${fmtTime(iso)}`;

export const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY }).format(cents / 100);

export const fmtDuration = (min: number) =>
  min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;

/** Today's date (YYYY-MM-DD) in the spa timezone. */
export const todayYmd = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

/** Local date (YYYY-MM-DD) of an instant, in the spa timezone. */
export const ymdOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));

export function addDays(ymd: string, n: number) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Pure calendar formatting of a YYYY-MM-DD (no timezone shifting). */
export function ymdParts(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...o }).format(date);
  return {
    weekday: f({ weekday: 'short' }),
    day: d,
    month: f({ month: 'short' }),
    long: f({ weekday: 'long', day: 'numeric', month: 'long' }),
    isoWeekday: ((date.getUTCDay() + 6) % 7) + 1,
  };
}

/** Minutes since local midnight (spa tz) of an instant. */
export function minuteOfDay(iso: string) {
  const [h, m] = fmt({ hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)).split(':').map(Number);
  return (h % 24) * 60 + m;
}

/** Convert a wall-clock time in the spa tz (YYYY-MM-DD + HH:mm) to a UTC ISO string. */
export function zonedToIso(ymd: string, hhmm: string) {
  const [y, mo, d] = ymd.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (t: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      }).formatToParts(new Date(t)).map((x) => [x.type, x.value]),
    );
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - t;
  };
  let t = wall - offsetAt(wall);
  t = wall - offsetAt(t); // second pass handles DST edges
  return new Date(t).toISOString();
}

export const minToHHMM = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const hhmmToMin = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

export const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
