import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {Throttle} from '@nestjs/throttler';
import {PresenceService} from './presence.service';
import {PresenceHeartbeatDto} from './dto/presence-heartbeat.dto';
import {OptionalSessionAuthGuard} from 'src/common/gaurds/optional-session-auth.gaurd';
import {PUBLIC_READ_THROTTLE} from 'src/common/constants/throttle';

// Public — anonymous readers count too (reading is public). Same throttle
// tier as the view-count ping (public, high-frequency-ish, low-value-per-call).
@Throttle(PUBLIC_READ_THROTTLE)
@Controller('stories')
export class PresenceController {
  constructor(private readonly presenceService: PresenceService) {}

  @Put(':id/presence')
  @UseGuards(OptionalSessionAuthGuard)
  async heartbeat(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() presenceHeartbeatDto: PresenceHeartbeatDto
  ) {
    const readerCount = await this.presenceService.heartbeat(
      id,
      presenceHeartbeatDto.tabId
    );
    return {readerCount};
  }

  // Fire-and-forget "I'm gone" signal, sent via navigator.sendBeacon on
  // unmount/tab-close so a genuine departure decrements the count right
  // away instead of waiting out the heartbeat's member TTL. sendBeacon
  // always POSTs and can't attach a custom header, so this can't carry a
  // CSRF token — it's excluded from CSRF in app.module.ts for exactly that
  // reason (not just the "no token yet" reasoning the view/heartbeat routes
  // have).
  @Post(':id/presence/leave')
  @HttpCode(204)
  async leave(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() presenceHeartbeatDto: PresenceHeartbeatDto
  ) {
    await this.presenceService.leave(id, presenceHeartbeatDto.tabId);
  }
}
