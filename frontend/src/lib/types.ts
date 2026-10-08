export type Role = 'CLIENT' | 'THERAPIST' | 'ADMIN';
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  therapistId: string | null;
}

export interface AppConfig {
  businessName: string;
  timezone: string;
  currency: string;
  slotStepMin: number;
  minLeadMin: number;
  horizonDays: number;
}

export interface Service {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  durationMin: number;
  bufferMin: number;
  priceCents: number;
  active: boolean;
  therapists?: { therapistId: string }[];
}

export interface WorkingHours {
  id?: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
}

export interface TimeOff {
  id: string;
  startAt: string;
  endAt: string;
  reason: string | null;
}

export interface Therapist {
  id: string;
  name: string;
  title: string | null;
  bio: string | null;
  active: boolean;
  services: { service: { id: string; name: string; category: string } }[];
  workingHours: WorkingHours[];
  timeOff?: TimeOff[];
  user?: { id: string; email: string } | null;
}

export interface TherapistRef {
  id: string;
  name: string;
  title: string | null;
}

export interface Slot {
  start: string;
  end: string;
  therapistIds: string[];
}

export interface DayAvailability {
  date: string;
  timezone: string;
  service: { id: string; name: string; durationMin: number; bufferMin: number; priceCents: number };
  therapists: TherapistRef[];
  slots: Slot[];
  /** Set when this day has no free slot: the next day that does. */
  nextAvailable: { date: string; start: string } | null;
}

export interface Booking {
  id: string;
  reference: string;
  startAt: string;
  endAt: string;
  blockedUntil: string;
  status: BookingStatus;
  priceCents: number;
  notes: string | null;
  service: { id: string; name: string; durationMin: number; category: string };
  therapist: TherapistRef;
  client: { id: string; name: string; email: string; phone: string | null };
}

export type RuleReason = 'ALREADY_BOOKED' | 'OUTSIDE_WORKING_HOURS' | 'TIME_OFF';

/** GET /availability/at-time - time-first booking. */
export interface AtTimeResult {
  available: boolean;
  service: { id: string; name: string; durationMin: number; bufferMin: number };
  requiredPeriod: { start: string; end: string; blockedUntil: string };
  therapists: (TherapistRef & { free: boolean; reason: RuleReason | null })[];
  alternatives?: Alternatives;
}

export interface Alternatives {
  freeTherapistsAtRequestedTime: TherapistRef[];
  nearestSlots: Slot[];
}

/** Body of a 409 from the booking endpoints. */
export interface BookingConflict {
  code: string;
  message: string;
  alternatives?: Alternatives;
}
