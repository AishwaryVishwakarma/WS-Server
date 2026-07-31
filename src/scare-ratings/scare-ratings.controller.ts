import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {Request} from 'express';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {ScareRatingsService} from './scare-ratings.service';
import {CastScareVoteDto} from './dto/cast-scare-vote.dto';

// Scare votes are gated (a vote belongs to the signed-in member). The public
// surface is just the aggregate scareRatingAverage/scareRatingCount on the
// story DTO — no per-user data (mirrors LikesController).
@UseGuards(SessionAuthGuard)
@Controller()
export class ScareRatingsController {
  constructor(private readonly scareRatingsService: ScareRatingsService) {}

  @Put('stories/:id/scare-rating')
  @HttpCode(204)
  async cast(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CastScareVoteDto,
    @Req() req: Request
  ) {
    await this.scareRatingsService.castVote(
      req.session.userId!,
      id,
      dto.value,
      req.session.role
    );
  }

  @Delete('stories/:id/scare-rating')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.scareRatingsService.removeVote(req.session.userId!, id);
  }

  @Get('users/me/scare-ratings')
  async mine(@Req() req: Request): Promise<Record<string, number>> {
    return this.scareRatingsService.myVotes(req.session.userId!);
  }
}
