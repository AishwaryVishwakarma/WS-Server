import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {plainToInstance} from 'class-transformer';
import {StoriesService} from '../stories.service';
import {Story} from '../entities/story.entity';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {RolesGuard} from 'src/common/gaurds/roles.gaurd';
import {Roles} from 'src/common/decorators/roles.decorators';
import {Role} from 'src/users/enums/role';
import {UpdateStoryStatusDto} from '../dto/update-story-status.dto';
import {BulkUpdateStoryStatusDto} from '../dto/bulk-update-story-status.dto';
import {AdminStoryQueryDto} from '../dto/admin-story-query.dto';
import {StoryResponseDto} from '../dto/story-response.dto';

@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.Admin)
@Controller('admin/stories')
export class AdminStoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  private _serialize(story: Story) {
    return plainToInstance(StoryResponseDto, story, {
      excludeExtraneousValues: true,
    });
  }

  @Get()
  async findAll(@Query() query: AdminStoryQueryDto) {
    const result = await this.storiesService.findAll(
      query.page,
      query.limit,
      query.status,
      query.search,
      query.reported
    );

    return {
      ...result,
      data: result.data.map((story) => this._serialize(story)),
    };
  }

  // Includes the individual reports against this story (reason + optional
  // detail + reporter) — the aggregate reportCount alone doesn't tell an
  // admin *why* it was reported.
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const story = await this.storiesService.findOneWithReports(id);
    return this._serialize(story);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateStoryStatusDto: UpdateStoryStatusDto
  ) {
    const story = await this.storiesService.updateStatus(
      id,
      updateStoryStatusDto.status
    );
    return this._serialize(story);
  }

  // Transitions several stories at once (all-or-nothing — see
  // StoriesService.bulkUpdateStatus). Not a route-order conflict with
  // ':id/status' below: this is a single literal segment, not a two-segment
  // path an :id could ever match.
  @Patch('bulk-status')
  async bulkUpdateStatus(@Body() dto: BulkUpdateStoryStatusDto) {
    const stories = await this.storiesService.bulkUpdateStatus(
      dto.ids,
      dto.status
    );
    return stories.map((story) => this._serialize(story));
  }

  // Dismiss the member reports on a story (drop the rows, zero the count) so it
  // leaves the reported queue — without touching its publication status.
  @Patch(':id/resolve')
  async resolveReports(@Param('id', ParseUUIDPipe) id: string) {
    const story = await this.storiesService.resolveReports(id);
    return this._serialize(story);
  }
}
