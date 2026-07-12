import {IsIn, IsOptional, IsString, MaxLength} from 'class-validator';
import {PaginationDto} from 'src/common/dto/pagination.dto';
import {
  MODERATION_STATUSES,
  StoryStatus,
} from '../enums/story-status.enum';

export class AdminStoryQueryDto extends PaginationDto {
  /**
   * Narrow the moderation list to one status (e.g. the pending queue).
   * Drafts are private to their authors and cannot be requested.
   */
  @IsOptional()
  @IsIn(MODERATION_STATUSES)
  status?: StoryStatus;

  /** Case-insensitive substring match against title and excerpt. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
