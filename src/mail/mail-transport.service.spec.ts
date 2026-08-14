import {ConfigService} from '@nestjs/config';
import {MailTransportService} from './mail-transport.service';
import type {Repository} from 'typeorm';
import type {User} from 'src/users/entities/user.entity';

function makeConfigService(values: Record<string, string>): ConfigService {
  return {get: (key: string) => values[key]} as unknown as ConfigService;
}

function mockFetchResponse(ok: boolean, status = 200) {
  return jest.fn().mockResolvedValue({ok, status});
}

const unsuppressedRepository = {
  findOne: jest.fn().mockResolvedValue(null),
} as unknown as Repository<User>;

describe('MailTransportService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('logs without calling the provider when delivery is disabled', async () => {
    global.fetch = jest.fn();
    const service = new MailTransportService(
      makeConfigService({}),
      unsuppressedRepository
    );

    expect(service.enabled).toBe(false);
    await service.deliver({
      to: 'reader@test.com',
      subject: 'Subject',
      text: 'Body',
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('posts all email parts to Resend with a timeout', async () => {
    const fetchMock = mockFetchResponse(true);
    global.fetch = fetchMock;
    const service = new MailTransportService(
      makeConfigService({
        RESEND_API_KEY: 're_test_key',
        MAIL_FROM: 'shadows@test.com',
      }),
      unsuppressedRepository
    );

    await service.deliver({
      to: 'reader@test.com',
      subject: 'Subject',
      text: 'Body',
      html: '<p>Body</p>',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer re_test_key',
          'Content-Type': 'application/json',
        },
        signal: expect.any(AbortSignal),
      })
    );
    const [, options] = fetchMock.mock.calls[0] as [string, {body: string}];
    expect(JSON.parse(options.body)).toEqual({
      from: 'shadows@test.com',
      to: 'reader@test.com',
      subject: 'Subject',
      text: 'Body',
      html: '<p>Body</p>',
    });
  });

  it('does not expose a rejected provider response body', async () => {
    global.fetch = mockFetchResponse(false, 422);
    const service = new MailTransportService(
      makeConfigService({RESEND_API_KEY: 're_test_key'}),
      unsuppressedRepository
    );

    await expect(
      service.deliver({to: 'reader@test.com', subject: 'Subject', text: 'Body'})
    ).rejects.toThrow('Resend API request failed (422)');
  });

  it('does not call the provider for a suppressed account', async () => {
    global.fetch = jest.fn();
    const repository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        emailSuppressedAt: new Date(),
      }),
    } as unknown as Repository<User>;
    const service = new MailTransportService(
      makeConfigService({RESEND_API_KEY: 're_test_key'}),
      repository
    );

    await service.deliver({
      to: 'reader@test.com',
      subject: 'Subject',
      text: 'Body',
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
