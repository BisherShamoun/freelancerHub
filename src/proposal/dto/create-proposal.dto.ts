import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateProposalDto {
  @IsUUID()
  projectId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(1000000)
  price: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  durationDays: number;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  message: string;
}
