import {
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {MODERATION_STATUSES, StoryStatus} from '../enums/story-status.enum';

export class UpdateStoryStatusDto {
  // Admins moderate between the four public statuses; they cannot push a
  // story back into the author's private drafts.
  @IsIn(MODERATION_STATUSES)
  status: StoryStatus;

  // Required exactly when rejecting — ValidateIf skips validation entirely
  // for every other target status, so approving/flagging/reopening a story
  // is unaffected. So the author always has an explanation, never a
  // mystery rejection.
  @ValidateIf(
    (dto: UpdateStoryStatusDto) => dto.status === StoryStatus.Rejected
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  rejectionReason?: string;
}
