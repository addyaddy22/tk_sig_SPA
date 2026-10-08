import { ApiProperty } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class GuestDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class CreateBookingDto {
  @IsString()
  serviceId: string;

  @ApiProperty({ example: '2026-10-01T10:00:00+02:00', description: 'Must be on the slot grid (e.g. :00, :15, :30, :45)' })
  @IsISO8601()
  startAt: string;

  /** Omit (or "any") to let the system assign the least busy free therapist. */
  @IsOptional()
  @IsString()
  therapistId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /** Admin only: book for an existing client... */
  @IsOptional()
  @IsString()
  clientId?: string;

  /** ...or for a walk-in / phone client (created if the email is new). */
  @IsOptional()
  @ValidateNested()
  @Type(() => GuestDto)
  guest?: GuestDto;
}

export class RescheduleBookingDto {
  @IsISO8601()
  startAt: string;

  @IsOptional()
  @IsString()
  therapistId?: string;
}

export class UpdateStatusDto {
  @IsIn([BookingStatus.CONFIRMED, BookingStatus.CANCELLED, BookingStatus.COMPLETED, BookingStatus.NO_SHOW])
  status: BookingStatus;
}

export class ListBookingsQuery {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @IsString()
  therapistId?: string;

  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}
