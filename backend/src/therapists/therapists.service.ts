import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DateTime } from 'luxon';
import { ACTIVE_STATUSES } from '../common/booking-status';
import { lockSchedule } from '../common/schedule-lock';
import { settings } from '../common/settings';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTherapistDto,
  CreateTimeOffDto,
  UpdateTherapistDto,
  WorkingHoursDto,
} from './dto/therapist.dto';

const therapistInclude = {
  services: { include: { service: { select: { id: true, name: true, category: true } } } },
  workingHours: { orderBy: [{ dayOfWeek: 'asc' }, { startMin: 'asc' }] },
  user: { select: { id: true, email: true } },
} satisfies Prisma.TherapistInclude;

@Injectable()
export class TherapistsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(opts: { serviceId?: string; includeInactive?: boolean }) {
    return this.prisma.therapist.findMany({
      where: {
        ...(opts.includeInactive ? {} : { active: true }),
        ...(opts.serviceId ? { services: { some: { serviceId: opts.serviceId } } } : {}),
      },
      orderBy: { name: 'asc' },
      include: therapistInclude,
    });
  }

  async findOne(id: string) {
    const therapist = await this.prisma.therapist.findUnique({
      where: { id },
      include: {
        ...therapistInclude,
        timeOff: { where: { endAt: { gt: new Date() } }, orderBy: { startAt: 'asc' } },
      },
    });
    if (!therapist) throw new NotFoundException('Therapist not found');
    return therapist;
  }

  async create(dto: CreateTherapistDto) {
    if (dto.workingHours) TherapistsService.validateHours(dto.workingHours);
    const userId = await this.createLogin(dto);
    return this.prisma.therapist.create({
      data: {
        name: dto.name.trim(),
        title: dto.title,
        bio: dto.bio,
        active: dto.active ?? true,
        userId,
        services: { create: (dto.serviceIds ?? []).map((serviceId) => ({ serviceId })) },
        workingHours: { create: dto.workingHours ?? [] },
      },
      include: therapistInclude,
    });
  }

  async update(id: string, dto: UpdateTherapistDto) {
    const existing = await this.findOne(id);
    const { serviceIds, workingHours, email, password, ...fields } = dto;
    if (serviceIds) await this.setServices(id, serviceIds);
    if (workingHours) await this.setWorkingHours(id, workingHours);
    const userId = !existing.userId && email ? await this.createLogin(dto) : undefined;
    return this.prisma.therapist.update({
      where: { id },
      data: { ...fields, ...(userId ? { userId } : {}) },
      include: therapistInclude,
    });
  }

  async setServices(id: string, serviceIds: string[]) {
    await this.prisma.$transaction(async (tx) => {
      await lockSchedule(tx);
      await tx.therapistService.deleteMany({ where: { therapistId: id } });
      await tx.therapistService.createMany({ data: serviceIds.map((serviceId) => ({ therapistId: id, serviceId })) });
    });
    return this.findOne(id);
  }

  /**
   * Replace the weekly schedule. Existing bookings are never silently dropped: any upcoming
   * booking that now falls outside the new hours is returned as a warning for staff to move.
   */
  async setWorkingHours(id: string, hours: WorkingHoursDto[]) {
    TherapistsService.validateHours(hours);
    await this.prisma.$transaction(async (tx) => {
      await lockSchedule(tx);
      await tx.workingHours.deleteMany({ where: { therapistId: id } });
      await tx.workingHours.createMany({ data: hours.map((h) => ({ ...h, therapistId: id })) });
    });

    const tz = settings().timezone;
    const upcoming = await this.prisma.booking.findMany({
      where: { therapistId: id, status: { in: ACTIVE_STATUSES }, startAt: { gt: new Date() } },
      include: { service: { select: { name: true } }, client: { select: { name: true } } },
      orderBy: { startAt: 'asc' },
    });
    const outsideHours = upcoming.filter((b) => {
      const s = DateTime.fromJSDate(b.startAt).setZone(tz);
      const e = DateTime.fromJSDate(b.endAt).setZone(tz);
      const startMin = s.hour * 60 + s.minute;
      const endMin = startMin + Math.round(e.diff(s, 'minutes').minutes);
      return !hours.some((h) => h.dayOfWeek === s.weekday && h.startMin <= startMin && endMin <= h.endMin);
    });

    return { therapist: await this.findOne(id), warnings: { bookingsOutsideNewHours: outsideHours } };
  }

  async addTimeOff(id: string, dto: CreateTimeOffDto) {
    await this.findOne(id);
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt <= startAt) throw new BadRequestException('Time off must end after it starts');

    // Under the schedule lock, so no booking can land in this period while we check it.
    return this.prisma.$transaction(async (tx) => {
      await lockSchedule(tx);
      const conflicts = await tx.booking.findMany({
        where: { therapistId: id, status: { in: ACTIVE_STATUSES }, startAt: { lt: endAt }, endAt: { gt: startAt } },
        include: { service: { select: { name: true } }, client: { select: { name: true, phone: true } } },
        orderBy: { startAt: 'asc' },
      });
      if (conflicts.length && !dto.force) {
        throw new ConflictException({
          statusCode: 409,
          code: 'TIME_OFF_HAS_BOOKINGS',
          message: `This therapist has ${conflicts.length} booking(s) in that period. Reschedule them first, or confirm to add the time off anyway.`,
          bookings: conflicts,
        });
      }
      return tx.timeOff.create({ data: { therapistId: id, startAt, endAt, reason: dto.reason } });
    });
  }

  async removeTimeOff(id: string, timeOffId: string) {
    const deleted = await this.prisma.timeOff.deleteMany({ where: { id: timeOffId, therapistId: id } });
    if (!deleted.count) throw new NotFoundException('Time off not found');
    return { ok: true };
  }

  private async createLogin(dto: CreateTherapistDto | UpdateTherapistDto): Promise<string | undefined> {
    if (!dto.email) return undefined;
    if (!dto.password) throw new BadRequestException('A password is required to create a therapist login');
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('A user with this email already exists');
    }
    const user = await this.prisma.user.create({
      data: { email, name: dto.name!.trim(), role: Role.THERAPIST, passwordHash: await bcrypt.hash(dto.password, 10) },
    });
    return user.id;
  }

  static validateHours(hours: WorkingHoursDto[]) {
    for (const h of hours) {
      if (h.startMin >= h.endMin) throw new BadRequestException('Each shift must end after it starts');
    }
    for (let d = 1; d <= 7; d++) {
      const day = hours.filter((h) => h.dayOfWeek === d).sort((a, b) => a.startMin - b.startMin);
      for (let i = 1; i < day.length; i++) {
        if (day[i].startMin < day[i - 1].endMin) throw new BadRequestException('Shifts on the same day overlap');
      }
    }
  }
}
