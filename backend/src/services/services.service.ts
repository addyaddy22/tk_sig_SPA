import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { settings } from '../common/settings';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(includeInactive = false) {
    return this.prisma.service.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: {
        therapists: { where: { therapist: { active: true } }, select: { therapistId: true } },
      },
    });
  }

  async findOne(id: string) {
    const service = await this.prisma.service.findUnique({
      where: { id },
      include: { therapists: { include: { therapist: { select: { id: true, name: true, title: true } } } } },
    });
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  async create(dto: CreateServiceDto) {
    this.checkDuration(dto.durationMin, dto.bufferMin);
    let slug = slugify(dto.name);
    if (await this.prisma.service.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;
    return this.prisma.service.create({ data: { ...dto, slug } });
  }

  async update(id: string, dto: UpdateServiceDto) {
    await this.findOne(id);
    this.checkDuration(dto.durationMin, dto.bufferMin);
    // Changing duration only affects new bookings: existing ones keep their stored start/end.
    return this.prisma.service.update({ where: { id }, data: dto });
  }

  /** Soft delete: past bookings still reference the service. */
  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.service.update({ where: { id }, data: { active: false } });
  }

  private checkDuration(durationMin?: number, bufferMin?: number) {
    const step = settings().slotStepMin;
    for (const [label, v] of [['Duration', durationMin], ['Buffer', bufferMin]] as const) {
      if (v !== undefined && v % step !== 0) {
        throw new BadRequestException(`${label} must be a multiple of ${step} minutes`);
      }
    }
  }
}
