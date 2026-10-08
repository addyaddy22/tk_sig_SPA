import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [AvailabilityModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
