import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, Prisma, Role, Service } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { DateTime } from 'luxon';
import { AuthUser } from '../auth/decorators';
import { AvailabilityService } from '../availability/availability.service';
import { checkSlot, pickLeastBusy } from '../availability/slot-engine';
import { ACTIVE_STATUSES } from '../common/booking-status';
import { lockSchedule } from '../common/schedule-lock';
import { settings } from '../common/settings';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto, ListBookingsQuery, RescheduleBookingDto, UpdateStatusDto } from './dto/booking.dto';

/** A requested time can't be booked. Carries a machine-readable code for the UI. */
class SlotUnavailable extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const bookingInclude = {
  service: { select: { id: true, name: true, durationMin: true, bufferMin: true, category: true } },
  therapist: { select: { id: true, name: true, title: true } },
  client: { select: { id: true, name: true, email: true, phone: true } },
} satisfies Prisma.BookingInclude;

const MIN = 60_000;

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
  ) {}

  // ---------------------------------------------------------------- create / reschedule

  async create(user: AuthUser, dto: CreateBookingDto) {
    const service = await this.availability.getActiveService(this.prisma, dto.serviceId);
    const start = this.parseStart(dto.startAt, user.role === Role.ADMIN);
    const clientId = await this.resolveClient(user, dto);
    const therapistId = dto.therapistId && dto.therapistId !== 'any' ? dto.therapistId : undefined;

    return this.withConflictHandling(service, start, therapistId, () =>
      this.prisma.$transaction(async (tx) => {
        await lockSchedule(tx);
        const chosen = await this.pickTherapist(tx, { clientId, service, start, therapistId });
        const end = start.plus({ minutes: service.durationMin });
        return tx.booking.create({
          data: {
            reference: BookingsService.newReference(),
            clientId,
            therapistId: chosen,
            serviceId: service.id,
            startAt: start.toJSDate(),
            endAt: end.toJSDate(),
            blockedUntil: end.plus({ minutes: service.bufferMin }).toJSDate(),
            priceCents: service.priceCents,
            notes: dto.notes?.trim() || null,
            status: BookingStatus.CONFIRMED,
          },
          include: bookingInclude,
        });
      }),
    );
  }

  async reschedule(user: AuthUser, id: string, dto: RescheduleBookingDto) {
    const booking = await this.getOwned(user, id);
    if (!ACTIVE_STATUSES.includes(booking.status)) {
      throw new BadRequestException('Only upcoming bookings can be rescheduled');
    }
    const service = await this.availability.getActiveService(this.prisma, booking.serviceId);
    const start = this.parseStart(dto.startAt, user.role === Role.ADMIN);
    const therapistId = dto.therapistId && dto.therapistId !== 'any' ? dto.therapistId : undefined;

    return this.withConflictHandling(service, start, therapistId, () =>
      this.prisma.$transaction(async (tx) => {
        await lockSchedule(tx);
        const chosen = await this.pickTherapist(tx, {
          clientId: booking.clientId,
          service,
          start,
          therapistId,
          excludeBookingId: booking.id,
        });
        const end = start.plus({ minutes: service.durationMin });
        return tx.booking.update({
          where: { id: booking.id },
          data: {
            therapistId: chosen,
            startAt: start.toJSDate(),
            endAt: end.toJSDate(),
            blockedUntil: end.plus({ minutes: service.bufferMin }).toJSDate(),
          },
          include: bookingInclude,
        });
      }),
    );
  }

  /**
   * Decide which therapist gets the booking - or explain precisely why nobody can.
   * Must run inside the locked transaction.
   */
  private async pickTherapist(
    tx: Prisma.TransactionClient,
    p: { clientId: string; service: Service; start: DateTime; therapistId?: string; excludeBookingId?: string },
  ): Promise<string> {
    const { service, start } = p;
    const end = start.plus({ minutes: service.durationMin });

    // 1. The client can't be in two treatments at once.
    const clash = await tx.booking.findFirst({
      where: {
        clientId: p.clientId,
        status: { in: ACTIVE_STATUSES },
        startAt: { lt: end.toJSDate() },
        endAt: { gt: start.toJSDate() },
        ...(p.excludeBookingId ? { id: { not: p.excludeBookingId } } : {}),
      },
      include: { service: { select: { name: true } } },
    });
    if (clash) {
      const when = DateTime.fromJSDate(clash.startAt).setZone(settings().timezone).toFormat('ccc d LLL, HH:mm');
      throw new SlotUnavailable(
        'CLIENT_OVERLAP',
        `This client already has a booking (${clash.service.name}, ${when}) that overlaps this time.`,
      );
    }

    // 2. Evaluate the requested therapist, or everyone who offers the service.
    const candidates = await this.availability.loadTherapistDays(tx, {
      serviceId: service.id,
      dayStart: start.startOf('day'),
      therapistIds: p.therapistId ? [p.therapistId] : undefined,
      excludeBookingId: p.excludeBookingId,
    });
    const blockMs = AvailabilityService.blockMs(service);
    const judged = candidates.map((t) => ({
      ...t,
      reason: checkSlot(t.day, start.toMillis(), service.durationMin * MIN, blockMs),
    }));

    if (p.therapistId) {
      const t = judged[0];
      if (!t) {
        const therapist = await tx.therapist.findUnique({ where: { id: p.therapistId } });
        if (!therapist) throw new NotFoundException('Therapist not found');
        throw therapist.active
          ? new SlotUnavailable('NOT_QUALIFIED', `${therapist.name} does not offer ${service.name}.`)
          : new SlotUnavailable('THERAPIST_INACTIVE', `${therapist.name} is not currently taking bookings.`);
      }
      if (t.reason) {
        throw new SlotUnavailable(t.reason, AvailabilityService.reasonMessage(t.reason, t.name));
      }
      return t.id;
    }

    const chosen = pickLeastBusy(judged.filter((t) => t.reason === null));
    if (!chosen) {
      throw new SlotUnavailable(
        'NO_THERAPIST_AVAILABLE',
        AvailabilityService.reasonMessage('NO_THERAPIST_AVAILABLE', service.name),
      );
    }
    return chosen.id;
  }

  /** Turn scheduling failures into a 409 that includes smart alternatives. */
  private async withConflictHandling<T>(
    service: Service,
    start: DateTime,
    therapistId: string | undefined,
    run: () => Promise<T>,
  ): Promise<T> {
    try {
      return await run();
    } catch (err) {
      let code: string;
      let message: string;
      if (err instanceof SlotUnavailable) {
        ({ code, message } = err);
      } else if (BookingsService.isOverlapViolation(err)) {
        // Last line of defence: the PostgreSQL exclusion constraint fired.
        code = 'SLOT_TAKEN';
        message = 'Sorry, that time was just taken. Please choose another slot.';
      } else {
        throw err;
      }
      const alternatives =
        code === 'CLIENT_OVERLAP' ? undefined : await this.availability.suggest(service.id, start, therapistId);
      throw new ConflictException({ statusCode: 409, code, message, alternatives });
    }
  }

  private static isOverlapViolation(err: unknown) {
    const text = String((err as Error)?.message ?? '');
    return /booking_no_(therapist|client)_overlap|23P01|exclusion constraint/.test(text);
  }

  private parseStart(startAt: string, isAdmin: boolean): DateTime {
    const cfg = settings();
    const start = DateTime.fromISO(startAt, { zone: cfg.timezone });
    if (!start.isValid) throw new BadRequestException('startAt must be an ISO date-time');

    const minuteOfDay = start.hour * 60 + start.minute;
    if (minuteOfDay % cfg.slotStepMin !== 0 || start.second !== 0 || start.millisecond !== 0) {
      throw new BadRequestException(`Bookings start on ${cfg.slotStepMin}-minute boundaries`);
    }
    const now = DateTime.now();
    const earliest = isAdmin ? now : now.plus({ minutes: cfg.minLeadMin });
    if (start < earliest) {
      throw new BadRequestException(
        isAdmin ? 'That time is in the past' : `Bookings must be made at least ${cfg.minLeadMin} minutes ahead`,
      );
    }
    if (start > now.plus({ days: cfg.horizonDays })) {
      throw new BadRequestException(`Bookings open up to ${cfg.horizonDays} days ahead`);
    }
    return start;
  }

  private async resolveClient(user: AuthUser, dto: CreateBookingDto): Promise<string> {
    if (!dto.clientId && !dto.guest) return user.id;
    if (user.role !== Role.ADMIN) throw new ForbiddenException('Only staff can book for another client');

    if (dto.clientId) {
      const client = await this.prisma.user.findUnique({ where: { id: dto.clientId } });
      if (!client) throw new NotFoundException('Client not found');
      return client.id;
    }
    const email = dto.guest!.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) return existing.id;
    const created = await this.prisma.user.create({
      data: {
        email,
        name: dto.guest!.name.trim(),
        phone: dto.guest!.phone?.trim() || null,
        // Random password: the client can be given a reset/registration flow later.
        passwordHash: await bcrypt.hash(randomBytes(24).toString('hex'), 10),
      },
    });
    return created.id;
  }

  private static newReference() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(6);
    return 'TK-' + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  }

  // ---------------------------------------------------------------- read / status

  async mine(user: AuthUser) {
    return this.prisma.booking.findMany({
      where: { clientId: user.id },
      orderBy: { startAt: 'desc' },
      include: bookingInclude,
    });
  }

  async list(user: AuthUser, q: ListBookingsQuery) {
    const tz = settings().timezone;
    let from: DateTime | undefined;
    let to: DateTime | undefined;
    if (q.date) {
      from = AvailabilityService.localDay(q.date);
      to = from.plus({ days: 1 });
    } else {
      if (q.from) from = AvailabilityService.localDay(q.from);
      if (q.to) to = AvailabilityService.localDay(q.to).plus({ days: 1 });
    }
    // Therapists only ever see their own schedule.
    const therapistId = user.role === Role.THERAPIST ? (user.therapistId ?? '__none__') : q.therapistId;

    const rows = await this.prisma.booking.findMany({
      where: {
        ...(therapistId ? { therapistId } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(from || to
          ? { startAt: { ...(from ? { gte: from.toJSDate() } : {}), ...(to ? { lt: to.toJSDate() } : {}) } }
          : {}),
      },
      orderBy: { startAt: 'asc' },
      include: bookingInclude,
      take: BookingsService.LIST_LIMIT,
    });

    // Admins also get each client's all-time history, so repeat no-shows stand out.
    const history = user.role === Role.ADMIN ? await this.clientHistory(rows.map((b) => b.clientId)) : undefined;
    return rows.map((b) => ({
      ...b,
      localDate: DateTime.fromJSDate(b.startAt).setZone(tz).toISODate(),
      ...(history ? { clientHistory: history.get(b.clientId) } : {}),
    }));
  }

  static readonly LIST_LIMIT = 2000;

  /** Booking counts per client, by status, across all time. */
  private async clientHistory(clientIds: string[]) {
    const ids = [...new Set(clientIds)];
    const empty = () => ({ total: 0, completed: 0, cancelled: 0, noShow: 0 });
    const map = new Map(ids.map((id) => [id, empty()]));
    if (!ids.length) return map;
    const groups = await this.prisma.booking.groupBy({
      by: ['clientId', 'status'],
      where: { clientId: { in: ids } },
      _count: { _all: true },
    });
    for (const g of groups) {
      const h = map.get(g.clientId)!;
      const n = g._count._all;
      h.total += n;
      if (g.status === BookingStatus.COMPLETED) h.completed += n;
      if (g.status === BookingStatus.CANCELLED) h.cancelled += n;
      if (g.status === BookingStatus.NO_SHOW) h.noShow += n;
    }
    return map;
  }

  async findOne(user: AuthUser, id: string) {
    const booking = await this.getOwned(user, id);
    return this.prisma.booking.findUnique({ where: { id: booking.id }, include: bookingInclude });
  }

  async cancel(user: AuthUser, id: string) {
    const booking = await this.getOwned(user, id);
    if (!ACTIVE_STATUSES.includes(booking.status)) {
      throw new BadRequestException('This booking is not active');
    }
    if (user.role === Role.CLIENT && booking.startAt <= new Date()) {
      throw new BadRequestException('Past bookings cannot be cancelled');
    }
    return this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.CANCELLED, cancelledAt: new Date() },
      include: bookingInclude,
    });
  }

  async updateStatus(user: AuthUser, id: string, dto: UpdateStatusDto) {
    const booking = await this.getOwned(user, id);
    if (booking.status === BookingStatus.CANCELLED && dto.status !== BookingStatus.CANCELLED) {
      // Re-activating could collide with a booking made since; make a new booking instead.
      throw new BadRequestException('Cancelled bookings cannot be re-opened. Create a new booking instead.');
    }
    if (dto.status === BookingStatus.CANCELLED) return this.cancel(user, id);
    return this.prisma.booking.update({ where: { id }, data: { status: dto.status }, include: bookingInclude });
  }

  /** Load a booking the caller is allowed to act on. */
  private async getOwned(user: AuthUser, id: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');
    const allowed =
      user.role === Role.ADMIN ||
      booking.clientId === user.id ||
      (user.role === Role.THERAPIST && booking.therapistId === user.therapistId);
    if (!allowed) throw new NotFoundException('Booking not found');
    return booking;
  }
}
