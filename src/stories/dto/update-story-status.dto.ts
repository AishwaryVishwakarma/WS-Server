import {IsIn} from 'class-validator';
import {MODERATION_STATUSES, StoryStatus} from '../enums/story-status.enum';

export class UpdateStoryStatusDto {
  // Admins moderate between the four public statuses; they cannot push a
  // story back into the author's private drafts.
  @IsIn(MODERATION_STATUSES)
  status: StoryStatus;
}
