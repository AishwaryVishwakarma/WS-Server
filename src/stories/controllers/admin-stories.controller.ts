import {Controller, Get, UseGuards} from '@nestjs/common';
import {StoriesService} from '../stories.service';
import {AdminOnlyGuard} from 'src/common/gaurds/admin-only.gaurd';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';

@UseGuards(SessionAuthGuard, AdminOnlyGuard)
@Controller('admin/stories')
export class AdminStoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @Get()
  findAll() {
    return this.storiesService.findAll();
  }
}
