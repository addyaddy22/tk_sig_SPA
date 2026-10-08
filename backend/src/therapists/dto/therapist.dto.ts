import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class WorkingHoursDto {
  /** 1 = Monday ... 7 = Sunday */
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek: number;

  /** Minutes after midnight, e.g. 540 = 09:00 */
  @IsInt()
  @Min(0)
  @Max(1440)
  startMin: number;

  @IsInt()
  @Min(0)
  @Max(1440)
  endMin: number;
}

export class CreateTherapistDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  serviceIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingHoursDto)
  workingHours?: WorkingHoursDto[];

  /** Optional staff login so the therapist can see their own schedule. */
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}

export class UpdateTherapistDto extends PartialType(CreateTherapistDto) {}

export class SetServicesDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  serviceIds: string[];
}

export class SetWorkingHoursDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingHoursDto)
  hours: WorkingHoursDto[];
}

export class CreateTimeOffDto {
  @IsISO8601()
  startAt: string;

  @IsISO8601()
  endAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;

  /** Create even if it overlaps existing bookings (they stay; staff must move them). */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
