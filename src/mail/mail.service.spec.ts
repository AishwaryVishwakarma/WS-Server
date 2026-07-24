import {ConfigService} from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {MailService} from './mail.service';

jest.mock('nodemailer');

function makeConfigService(values: Record<string, string>): ConfigService {
  return {get: (key: string) => values[key]} as unknown as ConfigService;
}

describe('MailService', () => {
  afterEach(() => jest.clearAllMocks());

  describe('when SMTP is not configured', () => {
    it('is disabled and logs instead of sending', async () => {
      const service = new MailService(makeConfigService({}));

      expect(service.enabled).toBe(false);
      await service.send('reader@test.com', 'Subject', 'Body');

      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });
  });

  describe('when SMTP is configured', () => {
    const sendMail = jest.fn().mockResolvedValue(undefined);

    beforeEach(() => {
      (nodemailer.createTransport as jest.Mock).mockReturnValue({sendMail});
    });

    it('is enabled and sends through the configured transport', async () => {
      const service = new MailService(
        makeConfigService({
          SMTP_HOST: 'smtp.test.com',
          SMTP_PORT: '2525',
          SMTP_USER: 'user',
          SMTP_PASSWORD: 'pass',
          SMTP_FROM: 'shadows@test.com',
        })
      );

      expect(service.enabled).toBe(true);
      await service.send('reader@test.com', 'Subject', 'Body');

      expect(sendMail).toHaveBeenCalledWith({
        from: 'shadows@test.com',
        to: 'reader@test.com',
        subject: 'Subject',
        text: 'Body',
      });
    });

    it('omits auth when no SMTP_USER is set', () => {
      new MailService(makeConfigService({SMTP_HOST: 'smtp.test.com'}));

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({auth: undefined})
      );
    });
  });
});
