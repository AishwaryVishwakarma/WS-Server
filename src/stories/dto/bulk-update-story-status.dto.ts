import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsUUID,
} from 'class-validator';
import {MODERATION_STATUSES, StoryStatus} from '../enums/story-status.enum';

export class BulkUpdateStoryStatusDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50) // a page's worth — not "select every pending story ever"
  @IsUUID('4', {each: true})
  ids: string[];

  @IsIn(MODERATION_STATUSES)
  status: StoryStatus;
}
