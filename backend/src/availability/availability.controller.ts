import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators';
import { AvailabilityService } from './availability.service';
import { CheckQuery, DayQuery } from './dto/availability.dto';

@ApiTags('Availability')
@Public()
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  @ApiOperation({
    summary: 'THERAPIST-FIRST / calendar: free start times on a day (optionally for one therapist)',
    description:
      'Times are computed from service duration + cleanup buffer, therapist skills, weekly working hours, ' +
      'time off (breaks/leave) and existing bookings. Each slot lists the therapists free for the whole period. ' +
      'If nothing is free, `nextAvailable` gives the next day that has a slot.',
  })
  day(@Query() q: DayQuery) {
    return this.availability.getDay(q.serviceId, q.date, q.therapistId);
  }

  @Get(['at-time', 'check'])
  @ApiOperation({
    summary: 'TIME-FIRST: which qualified therapists are free for the entire period starting at startAt',
    description: 'Lists every therapist who offers the service, with `free` and a `reason` when not. Includes alternatives when nobody is free.',
  })
  check(@Query() q: CheckQuery) {
    return this.availability.check(q.serviceId, q.startAt, q.therapistId);
  }
}
