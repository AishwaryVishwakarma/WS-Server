import 'express-session';
import {Role} from 'src/users/enums/role';

declare module 'express-session' {
  interface SessionData {
    // Absent on anonymous sessions — public read routes allow those
    userId?: string;
    role?: Role;
  }
}
