import {ConflictException, InternalServerErrorException} from '@nestjs/common';
import {QueryFailedError} from 'typeorm';

export function handleQueryFailedError(error: unknown, action: string) {
  if (error instanceof QueryFailedError) {
    // Postgres SQLSTATE for unique_violation
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if ((error as any).code === '23505') {
      throw new ConflictException(`${action} failed: Duplicate entry`);
    }

    throw new InternalServerErrorException(`Failed to ${action} record`);
  }

  throw error;
}
