import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Service } from '@prisma/client';
import { DateTime } from 'luxon';
import { ACTIVE_STATUSES } from '../common/booking-status';
import { settings } from '../common/settings';
import { PrismaService } from '../prisma/prisma.service';
import { checkSlot, freeStarts, Interval, SlotRejection, TherapistDay } from './slot-engine';

/** PrismaService or an interactive-transaction client. */
type Db = PrismaService | Prisma.TransactionClient;

export interface LoadedTherapist {
  id: string;
  name: string;
  title: string | null;
  day: TherapistDay;
}

export interface Slot {
  start: string;
  end: string;
  /** Therapists free for the whole treatment at this time. */
  therapistIds: string[];
}

const MIN = 60_000;

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Parse a YYYY-MM-DD date as the start of that day in the spa's timezone. */
  static localDay(date: string): DateTime {
    const d = DateTime.fromISO(date, { zone: settings().timezone });
    if (!d.isValid || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date must be in YYYY-MM-DD format');
    }
    return d.startOf('day');
  }

  static blockMs(service: Pick<Service, 'durationMin' | 'bufferMin'>) {
    return (service.durationMin + service.bufferMin) * MIN;
  }

  async getActiveService(db: Db, serviceId: string) {
    const service = await db.service.findFirst({ where: { id: serviceId, active: true } });
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  /**
   * Load everything needed to judge a therapist's day: shifts, time off and active bookings.
   * Only returns active therapists who offer the service.
   */
  async loadTherapistDays(
    db: Db,
    opts: { serviceId: string; dayStart: DateTime; therapistIds?: string[]; excludeBookingId?: string },
  ): Promise<LoadedTherapist[]> {
    const { dayStart } = opts;
    const dayEnd = dayStart.plus({ days: 1 });
    // Pad the window so bookings/time off straddling midnight are still seen.
    const from = dayStart.minus({ hours: 12 }).toJSDate();
    const to = dayEnd.plus({ hours: 12 }).toJSDate();

    const therapists = await db.therapist.findMany({
      where: {
        active: true,
        services: { some: { serviceId: opts.serviceId } },
        ...(opts.therapistIds ? { id: { in: opts.therapistIds } } : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        workingHours: { where: { dayOfWeek: dayStart.weekday } },
        timeOff: { where: { startAt: { lt: to }, endAt: { gt: from } } },
        bookings: {
          where: {
            status: { in: ACTIVE_STATUSES },
            startAt: { lt: to },
            blockedUntil: { gt: from },
            ...(opts.excludeBookingId ? { id: { not: opts.excludeBookingId } } : {}),
          },
          select: { startAt: true, blockedUntil: true },
        },
      },
    });

    const minuteOfDay = (min: number) =>
      min >= 1440 ? dayEnd : dayStart.set({ hour: Math.floor(min / 60), minute: min % 60 });

    return therapists.map((t) => ({
      id: t.id,
      name: t.name,
      title: t.title,
      day: {
        shifts: t.workingHours.map(
          (w): Interval => ({ start: minuteOfDay(w.startMin).toMillis(), end: minuteOfDay(w.endMin).toMillis() }),
        ),
        timeOff: t.timeOff.map((o) => ({ start: o.startAt.getTime(), end: o.endAt.getTime() })),
        bookings: t.bookings.map((b) => ({ start: b.startAt.getTime(), end: b.blockedUntil.getTime() })),
      },
    }));
  }

  /**
   * THERAPIST-FIRST and general calendar view: every bookable start time for a service on a
   * date, and which therapists are free for the whole treatment at each time. With a
   * therapistId, only that therapist's free times are returned. If the day has nothing free,
   * `nextAvailable` points to the next day that does.
   */
  async getDay(serviceId: string, date: string, therapistId?: string) {
    const day = await this.computeDay(serviceId, date, therapistId);
    if (day.slots.length) return { ...day, nextAvailable: null };

    const cfg = settings();
    const today = DateTime.now().setZone(cfg.timezone).toISODate()!;
    let cursor = AvailabilityService.localDay(date.localeCompare(today) < 0 ? today : date);
    let nextAvailable: { date: string; start: string } | null = null;
    for (let i = 0; i < 21 && !nextAvailable; i++) {
      cursor = cursor.plus({ days: 1 });
      try {
        const next = await this.computeDay(serviceId, cursor.toISODate()!, therapistId);
        if (next.slots.length) nextAvailable = { date: next.date!, start: next.slots[0].start };
      } catch {
        break; // past the booking horizon
      }
    }
    return { ...day, nextAvailable };
  }

  async computeDay(serviceId: string, date: string, therapistId?: string, db: Db = this.prisma) {
    const cfg = settings();
    const service = await this.getActiveService(db, serviceId);
    const dayStart = AvailabilityService.localDay(date);
    const now = DateTime.now().setZone(cfg.timezone);

    if (dayStart > now.startOf('day').plus({ days: cfg.horizonDays })) {
      throw new BadRequestException(`Bookings open up to ${cfg.horizonDays} days ahead`);
    }

    const therapists = await this.loadTherapistDays(db, {
      serviceId,
      dayStart,
      therapistIds: therapistId ? [therapistId] : undefined,
    });

    const durationMs = service.durationMin * MIN;
    const opts = {
      stepMs: cfg.slotStepMin * MIN,
      durationMs,
      blockMs: AvailabilityService.blockMs(service),
      gridOrigin: dayStart.toMillis(),
      notBefore: now.plus({ minutes: cfg.minLeadMin }).toMillis(),
    };

    const byStart = new Map<number, string[]>();
    for (const t of therapists) {
      for (const s of freeStarts(t.day, opts)) {
        if (s >= dayStart.plus({ days: 1 }).toMillis()) continue;
        byStart.set(s, [...(byStart.get(s) ?? []), t.id]);
      }
    }

    const slots: Slot[] = [...byStart.entries()]
      .sort(([a], [b]) => a - b)
      .map(([s, ids]) => ({
        start: new Date(s).toISOString(),
        end: new Date(s + durationMs).toISOString(),
        therapistIds: ids,
      }));

    return {
      date: dayStart.toISODate(),
      timezone: cfg.timezone,
      service: {
        id: service.id,
        name: service.name,
        durationMin: service.durationMin,
        bufferMin: service.bufferMin,
        priceCents: service.priceCents,
      },
      therapists: therapists.map(({ id, name, title }) => ({ id, name, title })),
      slots,
    };
  }

  /**
   * TIME-FIRST: for a chosen start time, list every therapist qualified for the service and
   * whether they are free for the ENTIRE required period (treatment + cleanup buffer), with
   * the reason when they are not. If nobody (or the requested therapist) is free, alternatives
   * are included.
   */
  async check(serviceId: string, startAt: string, therapistId?: string) {
    const cfg = settings();
    const service = await this.getActiveService(this.prisma, serviceId);
    const start = DateTime.fromISO(startAt, { zone: cfg.timezone });
    if (!start.isValid) throw new BadRequestException('startAt must be an ISO date-time');

    const therapists = await this.loadTherapistDays(this.prisma, {
      serviceId,
      dayStart: start.startOf('day'),
    });
    const results = therapists.map((t) => ({
      id: t.id,
      name: t.name,
      title: t.title,
      free: false,
      reason: checkSlot(t.day, start.toMillis(), service.durationMin * MIN, AvailabilityService.blockMs(service)),
    }));
    for (const r of results) r.free = r.reason === null;
    const target = therapistId ? results.filter((r) => r.id === therapistId) : results;
    const available = target.some((r) => r.reason === null);

    const end = start.plus({ minutes: service.durationMin });
    return {
      available,
      service: { id: service.id, name: service.name, durationMin: service.durationMin, bufferMin: service.bufferMin },
      /** The period the therapist must be free for. */
      requiredPeriod: {
        start: start.toUTC().toISO(),
        end: end.toUTC().toISO(),
        blockedUntil: end.plus({ minutes: service.bufferMin }).toUTC().toISO(),
      },
      therapists: results,
      ...(available ? {} : { alternatives: await this.suggest(serviceId, start, therapistId) }),
    };
  }

  /** Alternatives when a requested time is not possible. */
  async suggest(serviceId: string, start: DateTime, therapistId?: string) {
    const cfg = settings();
    const local = start.setZone(cfg.timezone);
    const day = await this.computeDay(serviceId, local.toISODate()!);

    const atTime = day.slots.find((s) => Date.parse(s.start) === local.toMillis());
    const freeTherapistsAtRequestedTime = day.therapists.filter((t) => atTime?.therapistIds.includes(t.id));

    const forTherapist = (slots: Slot[]) =>
      therapistId ? slots.filter((s) => s.therapistIds.includes(therapistId)) : slots;

    // Closest free times on the same day for the requested therapist (or anyone).
    let nearestSlots = forTherapist(day.slots)
      .sort((a, b) => Math.abs(Date.parse(a.start) - local.toMillis()) - Math.abs(Date.parse(b.start) - local.toMillis()))
      .slice(0, 6)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

    // Nothing that day? Look ahead up to a week.
    for (let i = 1; nearestSlots.length === 0 && i <= 7; i++) {
      try {
        const next = await this.computeDay(serviceId, local.plus({ days: i }).toISODate()!);
        nearestSlots = forTherapist(next.slots).slice(0, 6);
      } catch {
        break; // past the booking horizon
      }
    }

    return { freeTherapistsAtRequestedTime, nearestSlots };
  }

  static reasonMessage(reason: SlotRejection | 'NO_THERAPIST_AVAILABLE', who: string) {
    switch (reason) {
      case 'ALREADY_BOOKED':
        return `${who} is already booked at that time.`;
      case 'OUTSIDE_WORKING_HOURS':
        return `${who} is not working at that time.`;
      case 'TIME_OFF':
        return `${who} is unavailable (time off) at that time.`;
      case 'NO_THERAPIST_AVAILABLE':
        return `No therapist is free for ${who} at that time.`;
    }
  }
}
