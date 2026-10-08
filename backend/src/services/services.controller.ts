import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Public, Roles } from '../auth/decorators';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';
import { ServicesService } from './services.service';

@ApiTags('Services')
@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Public()
  @Get()
  findAll() {
    return this.services.findAll();
  }

  @Get('admin/all')
  @Roles(Role.ADMIN)
  findAllAdmin(@Query('includeInactive') includeInactive?: string) {
    return this.services.findAll(includeInactive !== 'false');
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.services.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateServiceDto) {
    return this.services.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.services.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  deactivate(@Param('id') id: string) {
    return this.services.deactivate(id);
  }
}
