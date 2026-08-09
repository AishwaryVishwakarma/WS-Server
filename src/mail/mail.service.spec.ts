import {ConfigService} from '@nestjs/config';
import {MailService} from './mail.service';

function makeConfigService(values: Record<string, string>): ConfigService {
  return {get: (key: string) => values[key]} as unknown as ConfigService;
}

function mockFetchResponse(ok: boolean, status = 200, body = '{}') {
  return jest.fn().mockResolvedValue({
    ok,
    status,
    text: jest.fn().mockResolvedValue(body),
  });
}

describe('MailService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('when RESEND_API_KEY is not configured', () => {
    it('is disabled and logs instead of sending', async () => {
      global.fetch = jest.fn();
      const service = new MailService(makeConfigService({}));

      expect(service.enabled).toBe(false);
      await service.send('reader@test.com', 'Subject', 'Body');

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('when RESEND_API_KEY is configured', () => {
    it('is enabled and posts to the Resend API', async () => {
      const fetchMock = mockFetchResponse(true);
      global.fetch = fetchMock;

      const service = new MailService(
        makeConfigService({
          RESEND_API_KEY: 're_test_key',
          MAIL_FROM: 'shadows@test.com',
        })
      );

      expect(service.enabled).toBe(true);
      await service.send('reader@test.com', 'Subject', 'Body');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer re_test_key',
            'Content-Type': 'application/json',
          },
        })
      );
      const [, options] = fetchMock.mock.calls[0] as [string, {body: string}];
      expect(JSON.parse(options.body)).toEqual({
        from: 'shadows@test.com',
        to: 'reader@test.com',
        subject: 'Subject',
        text: 'Body',
        html: undefined,
      });
    });

    it('passes an optional html part through alongside the text one', async () => {
      const fetchMock = mockFetchResponse(true);
      global.fetch = fetchMock;

      const service = new MailService(
        makeConfigService({RESEND_API_KEY: 're_test_key'})
      );

      await service.send('reader@test.com', 'Subject', 'Body', '<p>Body</p>');

      const [, options] = fetchMock.mock.calls[0] as [string, {body: string}];
      expect(JSON.parse(options.body)).toEqual(
        expect.objectContaining({html: '<p>Body</p>'})
      );
    });

    it('falls back to the default From address when MAIL_FROM is unset', async () => {
      const fetchMock = mockFetchResponse(true);
      global.fetch = fetchMock;

      const service = new MailService(
        makeConfigService({RESEND_API_KEY: 're_test_key'})
      );
      await service.send('reader@test.com', 'Subject', 'Body');

      const [, options] = fetchMock.mock.calls[0] as [string, {body: string}];
      expect(JSON.parse(options.body).from).toBe(
        'no-reply@whisperingshadows.net'
      );
    });

    it('throws with the response body when the Resend API rejects the request', async () => {
      global.fetch = mockFetchResponse(false, 422, '{"message":"bad from"}');

      const service = new MailService(
        makeConfigService({RESEND_API_KEY: 're_test_key'})
      );

      await expect(
        service.send('reader@test.com', 'Subject', 'Body')
      ).rejects.toThrow('Resend API request failed (422)');
    });
  });
});
