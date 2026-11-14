import { UserRole } from '../../common/Enums/index.js';

export class currentUserDto {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
}
