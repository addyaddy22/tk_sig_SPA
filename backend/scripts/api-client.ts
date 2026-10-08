/**
 * Small typed HTTP client used by the API test scripts (race-test.ts, rules-test.ts).
 * Response shapes mirror what the NestJS API returns.
 */

export interface TherapistRef {
  id: string;
  name: string;
  title: string | null;
}

export interface Service {
  id: string;
  name: string;
  category: string;
  durationMin: number;
  bufferMin: number;
  priceCents: number;
}

export interface Slot {
  start: string;
  end: string;
  therapistIds: string[];
}

export interface DayAvailability {
  date: string;
  timezone: string;
  therapists: TherapistRef[];
  slots: Slot[];
  nextAvailable: { date: string; start: string } | null;
}

export type RuleReason = 'ALREADY_BOOKED' | 'OUTSIDE_WORKING_HOURS' | 'TIME_OFF';

export interface AtTimeResult {
  available: boolean;
  requiredPeriod: { start: string; end: string; blockedUntil: string };
  therapists: (TherapistRef & { free: boolean; reason: RuleReason | null })[];
}

export interface Booking {
  id: string;
  reference: string;
  startAt: string;
  endAt: string;
  therapist: TherapistRef;
  service: { id: string; name: string };
}

export interface TimeOff {
  id: string;
  startAt: string;
  endAt: string;
}

export interface Alternatives {
  freeTherapistsAtRequestedTime: TherapistRef[];
  nearestSlots: Slot[];
}

/** Body of any non-2xx response. `code` is set on booking-rule rejections (409). */
export interface ErrorBody {
  statusCode: number;
  message: string;
  code?: string;
  alternatives?: Alternatives;
}

export type ApiResponse<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: ErrorBody };

export interface BookingRequest {
  serviceId: string;
  startAt: string;
  therapistId?: string;
  notes?: string;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export const DEMO_PASSWORD = 'Password123!';

export class ApiClient {
  constructor(readonly base: string) {}

  async call<T>(path: string, opts: { token?: string; body?: unknown; method?: Method } = {}): Promise<ApiResponse<T>> {
    const res = await fetch(this.base + path, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers: {
        'Content-Type': 'application/json',
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const json: unknown = await res.json().catch(() => null);
    return res.ok
      ? { ok: true, status: res.status, data: json as T }
      : { ok: false, status: res.status, error: (json ?? { statusCode: res.status, message: res.statusText }) as ErrorBody };
  }

  /** Like call(), but throws on failure - for setup steps that must succeed. */
  async must<T>(path: string, opts: { token?: string; body?: unknown; method?: Method } = {}): Promise<T> {
    const r = await this.call<T>(path, opts);
    if (!r.ok) throw new Error(`${opts.method ?? 'GET'} ${path} failed (${r.status}): ${r.error.message}`);
    return r.data;
  }

  async login(email: string): Promise<string> {
    const r = await this.must<{ accessToken: string }>('/auth/login', { body: { email, password: DEMO_PASSWORD } });
    return r.accessToken;
  }

  async register(name: string, email: string): Promise<string> {
    const r = await this.must<{ accessToken: string }>('/auth/register', { body: { name, email, password: DEMO_PASSWORD } });
    return r.accessToken;
  }

  book(token: string, body: BookingRequest) {
    return this.call<Booking>('/bookings', { token, body });
  }

  cancel(token: string, bookingId: string) {
    return this.call<Booking>(`/bookings/${bookingId}/cancel`, { token, method: 'PATCH' });
  }

  availability(q: { serviceId: string; date: string; therapistId?: string }) {
    const p = new URLSearchParams({ serviceId: q.serviceId, date: q.date, ...(q.therapistId ? { therapistId: q.therapistId } : {}) });
    return this.must<DayAvailability>(`/availability?${p}`);
  }

  atTime(serviceId: string, startAt: string) {
    return this.must<AtTimeResult>(`/availability/at-time?${new URLSearchParams({ serviceId, startAt })}`);
  }

  addTimeOff(token: string, therapistId: string, body: { startAt: string; endAt: string; reason?: string; force?: boolean }) {
    return this.call<TimeOff>(`/therapists/${therapistId}/time-off`, { token, body });
  }

  removeTimeOff(token: string, therapistId: string, timeOffId: string) {
    return this.call<{ ok: true }>(`/therapists/${therapistId}/time-off/${timeOffId}`, { token, method: 'DELETE' });
  }
}

/** Rule code of a response: 'OK' on success, otherwise the API's `code` (or HTTP status). */
export const codeOf = (r: ApiResponse<unknown>): string => (r.ok ? 'OK' : (r.error.code ?? `HTTP ${r.status}`));

/** Unwrap a value that the demo seed guarantees exists. */
export function required<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`Missing ${what} - is the database seeded?`);
  return value;
}

export const apiBaseFromArgs = (): string => process.argv[2] ?? 'http://localhost:3000/api';

/** Run an async script, exiting non-zero on any uncaught error. */
export function runScript(main: () => Promise<void>) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
