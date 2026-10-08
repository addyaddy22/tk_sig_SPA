import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Public, Roles } from '../auth/decorators';
import {
  CreateTherapistDto,
  CreateTimeOffDto,
  SetServicesDto,
  SetWorkingHoursDto,
  UpdateTherapistDto,
} from './dto/therapist.dto';
import { TherapistsService } from './therapists.service';

@ApiTags('Therapists')
@Controller('therapists')
export class TherapistsController {
  constructor(private readonly therapists: TherapistsService) {}

  @Public()
  @Get()
  findAll(@Query('serviceId') serviceId?: string) {
    return this.therapists.findAll({ serviceId });
  }

  @Get('admin/all')
  @Roles(Role.ADMIN)
  findAllAdmin() {
    return this.therapists.findAll({ includeInactive: true });
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.therapists.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateTherapistDto) {
    return this.therapists.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateTherapistDto) {
    return this.therapists.update(id, dto);
  }

  @Put(':id/services')
  @Roles(Role.ADMIN)
  setServices(@Param('id') id: string, @Body() dto: SetServicesDto) {
    return this.therapists.setServices(id, dto.serviceIds);
  }

  @Put(':id/working-hours')
  @Roles(Role.ADMIN)
  setWorkingHours(@Param('id') id: string, @Body() dto: SetWorkingHoursDto) {
    return this.therapists.setWorkingHours(id, dto.hours);
  }

  @Post(':id/time-off')
  @Roles(Role.ADMIN)
  addTimeOff(@Param('id') id: string, @Body() dto: CreateTimeOffDto) {
    return this.therapists.addTimeOff(id, dto);
  }

  @Delete(':id/time-off/:timeOffId')
  @Roles(Role.ADMIN)
  removeTimeOff(@Param('id') id: string, @Param('timeOffId') timeOffId: string) {
    return this.therapists.removeTimeOff(id, timeOffId);
  }
}
