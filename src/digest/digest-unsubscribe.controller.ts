import {Controller, HttpCode, Post, Query} from '@nestjs/common';
import {DigestUnsubscribeService} from './digest-unsubscribe.service';

@Controller('digest')
export class DigestUnsubscribeController {
  constructor(private readonly unsubscribeService: DigestUnsubscribeService) {}

  // RFC 8058 one-click endpoint. It deliberately returns the same response
  // for valid, stale, and malformed tokens so it reveals no account state.
  @Post('unsubscribe')
  @HttpCode(204)
  async unsubscribe(@Query('token') token = ''): Promise<void> {
    await this.unsubscribeService.unsubscribe(token);
  }
}
