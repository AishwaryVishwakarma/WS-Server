import {ConflictException, InternalServerErrorException} from '@nestjs/common';
import {QueryFailedError} from 'typeorm';
import {handleQueryFailedError} from './handle-query-error';

describe('handleQueryFailedError', () => {
  it('maps duplicate-entry errors to ConflictException', () => {
    const error = new QueryFailedError('INSERT', [], new Error('dup'));
    (error as any).code = 'ER_DUP_ENTRY';

    expect(() => handleQueryFailedError(error, 'create')).toThrow(
      ConflictException
    );
  });

  it('maps other query failures to InternalServerErrorException', () => {
    const error = new QueryFailedError('INSERT', [], new Error('boom'));

    expect(() => handleQueryFailedError(error, 'create')).toThrow(
      InternalServerErrorException
    );
  });

  it('rethrows non-query errors unchanged', () => {
    const error = new Error('unrelated');

    expect(() => handleQueryFailedError(error, 'create')).toThrow(error);
  });
});
