import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiConflictResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../auth/decorators';
import { BookingsService } from './bookings.service';
import { CreateBookingDto, ListBookingsQuery, RescheduleBookingDto, UpdateStatusDto } from './dto/booking.dto';

@ApiTags('Bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  @ApiOperation({ summary: 'Book a treatment. Omit therapistId (or "any") to auto-assign a free therapist.' })
  @ApiConflictResponse({ description: 'Time not available - body has code, message and alternatives' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingDto) {
    return this.bookings.create(user, dto);
  }

  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.bookings.mine(user);
  }

  @Get()
  @Roles(Role.ADMIN, Role.THERAPIST)
  list(@CurrentUser() user: AuthUser, @Query() q: ListBookingsQuery) {
    return this.bookings.list(user, q);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookings.findOne(user, id);
  }

  @Patch(':id/reschedule')
  @ApiOperation({ summary: 'Move a booking - fully re-validated like a new booking' })
  @ApiConflictResponse({ description: 'New time not available - includes alternatives' })
  reschedule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RescheduleBookingDto) {
    return this.bookings.reschedule(user, id, dto);
  }

  @Patch(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookings.cancel(user, id);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.THERAPIST)
  updateStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.bookings.updateStatus(user, id, dto);
  }
}
