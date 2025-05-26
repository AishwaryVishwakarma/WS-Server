import {SetMetadata} from '@nestjs/common';
import type {Role} from 'src/users/enums/role';

export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
