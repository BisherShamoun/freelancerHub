import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../common/Enums/index.js';

export class CreateAuthDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  @MaxLength(70)
  password: string;

  // The admin account is never created from registration.
  @IsIn([UserRole.CLIENT, UserRole.FREELANCER])
  role: UserRole.CLIENT | UserRole.FREELANCER;
}
