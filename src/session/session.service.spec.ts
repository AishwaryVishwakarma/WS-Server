import type {Request} from 'express';
import {SessionService} from './session.service';

const createRequest = (error?: Error) =>
  ({
    session: {
      regenerate: jest.fn((cb: (err?: Error) => void) => cb(error)),
      destroy: jest.fn((cb: (err?: Error) => void) => cb(error)),
    },
  }) as unknown as Request;

describe('SessionService', () => {
  let service: SessionService;

  beforeEach(() => {
    service = new SessionService();
  });

  it('resolves when session regeneration succeeds', async () => {
    await expect(service.regenerate(createRequest())).resolves.toBeUndefined();
  });

  it('rejects when session regeneration fails', async () => {
    const error = new Error('regenerate failed');

    await expect(service.regenerate(createRequest(error))).rejects.toThrow(
      error
    );
  });

  it('resolves when session destruction succeeds', async () => {
    await expect(service.destroy(createRequest())).resolves.toBeUndefined();
  });

  it('rejects when session destruction fails', async () => {
    const error = new Error('destroy failed');

    await expect(service.destroy(createRequest(error))).rejects.toThrow(error);
  });
});
