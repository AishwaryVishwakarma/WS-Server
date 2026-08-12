import type {CallHandler, ExecutionContext} from '@nestjs/common';
import {lastValueFrom, of} from 'rxjs';
import {LoggingInterceptor} from './logging.interceptor';

function contextFor(url: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'GET',
        url,
        originalUrl: url,
        requestId: 'request-1',
      }),
      getResponse: () => ({statusCode: 200}),
    }),
  } as unknown as ExecutionContext;
}

describe('LoggingInterceptor', () => {
  const next: CallHandler = {handle: () => of(undefined)};

  it('suppresses routine notification stream logs', async () => {
    const interceptor = new LoggingInterceptor();
    const log = jest.spyOn(
      (interceptor as unknown as {logger: {log: () => void}}).logger,
      'log'
    );

    await lastValueFrom(
      interceptor.intercept(contextFor('/users/me/notifications/stream'), next)
    );

    expect(log).not.toHaveBeenCalled();
  });

  it('continues logging ordinary successful requests', async () => {
    const interceptor = new LoggingInterceptor();
    const log = jest
      .spyOn(
        (interceptor as unknown as {logger: {log: () => void}}).logger,
        'log'
      )
      .mockImplementation(() => undefined);

    await lastValueFrom(interceptor.intercept(contextFor('/stories'), next));

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('GET /stories → 200')
    );
  });
});
