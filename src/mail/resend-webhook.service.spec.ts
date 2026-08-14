import {BadRequestException} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {getRepositoryToken} from '@nestjs/typeorm';
import {Test} from '@nestjs/testing';
import {Webhook} from 'svix';
import {User} from 'src/users/entities/user.entity';
import {ResendWebhookService} from './resend-webhook.service';

const SECRET = `whsec_${Buffer.from('a-secret-long-enough-for-tests').toString('base64')}`;

describe('ResendWebhookService', () => {
  let service: ResendWebhookService;
  let update: jest.Mock;

  beforeEach(async () => {
    update = jest.fn().mockResolvedValue({affected: 1});
    const module = await Test.createTestingModule({
      providers: [
        ResendWebhookService,
        {provide: getRepositoryToken(User), useValue: {update}},
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'RESEND_WEBHOOK_SECRET' ? SECRET : undefined
            ),
          },
        },
      ],
    }).compile();
    service = module.get(ResendWebhookService);
  });

  const signed = (event: object) => {
    const payload = JSON.stringify(event);
    const id = 'msg_test_webhook';
    const date = new Date();
    return {
      rawBody: Buffer.from(payload),
      headers: {
        id,
        timestamp: String(Math.floor(date.getTime() / 1000)),
        signature: new Webhook(SECRET).sign(id, date, payload),
      },
    };
  };

  it('suppresses every recipient after a signed complaint', async () => {
    const request = signed({
      type: 'email.complained',
      data: {to: ['Reader@Test.com']},
    });

    await service.handle(request.rawBody, request.headers);

    expect(update).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        digestEmailEnabled: false,
        emailSuppressionReason: 'complaint',
        emailSuppressedAt: expect.any(Date),
      })
    );
  });

  it('ignores a temporary bounce', async () => {
    const request = signed({
      type: 'email.bounced',
      data: {to: ['reader@test.com'], bounce: {type: 'Temporary'}},
    });

    await service.handle(request.rawBody, request.headers);

    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a forged signature', async () => {
    const request = signed({
      type: 'email.complained',
      data: {to: ['reader@test.com']},
    });

    await expect(
      service.handle(request.rawBody, {
        ...request.headers,
        signature: 'v1,forged',
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });
});
