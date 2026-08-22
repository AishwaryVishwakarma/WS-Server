import {Controller, HttpCode, Post, Query} from '@nestjs/common';
import {WinbackUnsubscribeService} from './winback-unsubscribe.service';

@Controller('winback')
export class WinbackUnsubscribeController {
  constructor(private readonly unsubscribeService: WinbackUnsubscribeService) {}

  // RFC 8058 one-click endpoint. It deliberately returns the same response
  // for valid, stale, and malformed tokens so it reveals no account state.
  @Post('unsubscribe')
  @HttpCode(204)
  async unsubscribe(@Query('token') token = ''): Promise<void> {
    await this.unsubscribeService.unsubscribe(token);
  }
}
