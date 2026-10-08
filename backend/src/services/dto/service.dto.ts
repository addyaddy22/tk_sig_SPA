import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateServiceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsString()
  @MaxLength(1000)
  description: string;

  @IsString()
  @MaxLength(40)
  category: string;

  @IsInt()
  @Min(15)
  @Max(480)
  durationMin: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  bufferMin?: number;

  @IsInt()
  @Min(0)
  priceCents: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateServiceDto extends PartialType(CreateServiceDto) {}
