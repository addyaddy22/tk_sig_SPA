import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, Matches } from 'class-validator';

export class DayQuery {
  @IsString()
  serviceId: string;

  /** Day in the spa's timezone */
  @ApiProperty({ example: '2026-10-01' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;

  /** Only this therapist's free slots (omit for everyone) */
  @IsOptional()
  @IsString()
  therapistId?: string;
}

export class CheckQuery {
  @IsString()
  serviceId: string;

  @ApiProperty({ example: '2026-10-01T10:00:00+02:00' })
  @IsISO8601()
  startAt: string;

  @IsOptional()
  @IsString()
  therapistId?: string;
}
