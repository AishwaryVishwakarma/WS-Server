import {ConfigService} from '@nestjs/config';
import {MailTransportService} from './mail-transport.service';

function makeConfigService(values: Record<string, string>): ConfigService {
  return {get: (key: string) => values[key]} as unknown as ConfigService;
}

function mockFetchResponse(ok: boolean, status = 200) {
  return jest.fn().mockResolvedValue({ok, status});
}

describe('MailTransportService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('logs without calling the provider when delivery is disabled', async () => {
    global.fetch = jest.fn();
    const service = new MailTransportService(makeConfigService({}));

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
      })
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
      makeConfigService({RESEND_API_KEY: 're_test_key'})
    );

    await expect(
      service.deliver({to: 'reader@test.com', subject: 'Subject', text: 'Body'})
    ).rejects.toThrow('Resend API request failed (422)');
  });
});
