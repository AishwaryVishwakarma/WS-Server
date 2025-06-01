import 'express-session';
import {Role} from 'src/users/enums/role';

declare module 'express-session' {
  interface SessionData {
    userId: string;
    role: Role;
  }
}
