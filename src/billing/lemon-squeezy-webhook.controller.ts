import {Controller, HttpCode, Post, RawBodyRequest, Req} from '@nestjs/common';
import {SkipThrottle} from '@nestjs/throttler';
import type {Request} from 'express';
import {LemonSqueezyWebhookService} from './lemon-squeezy-webhook.service';

@Controller('webhooks')
export class LemonSqueezyWebhookController {
  constructor(private readonly webhookService: LemonSqueezyWebhookService) {}

  @Post('lemonsqueezy')
  @HttpCode(200)
  @SkipThrottle()
  async handle(@Req() req: RawBodyRequest<Request>): Promise<void> {
    await this.webhookService.handle(req.rawBody, req.header('x-signature'));
  }
}
