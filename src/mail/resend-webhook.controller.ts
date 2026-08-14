import {Controller, HttpCode, Post, RawBodyRequest, Req} from '@nestjs/common';
import {SkipThrottle} from '@nestjs/throttler';
import type {Request} from 'express';
import {ResendWebhookService} from './resend-webhook.service';

@Controller('webhooks')
export class ResendWebhookController {
  constructor(private readonly webhookService: ResendWebhookService) {}

  @Post('resend')
  @HttpCode(200)
  @SkipThrottle()
  async handle(@Req() req: RawBodyRequest<Request>): Promise<void> {
    await this.webhookService.handle(req.rawBody, {
      id: req.header('svix-id'),
      timestamp: req.header('svix-timestamp'),
      signature: req.header('svix-signature'),
    });
  }
}
