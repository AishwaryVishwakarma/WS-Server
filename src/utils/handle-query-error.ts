import {ConflictException, InternalServerErrorException} from '@nestjs/common';
import {QueryFailedError} from 'typeorm';

export function handleQueryFailedError(error: unknown, action: string) {
  if (error instanceof QueryFailedError) {
    // MySQL error code for duplicate entry: 1062
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if ((error as any).code === 'ER_DUP_ENTRY') {
      throw new ConflictException(`${action} failed: Duplicate entry`);
    }

    throw new InternalServerErrorException(`Failed to ${action} tag`);
  }

  throw error;
}
