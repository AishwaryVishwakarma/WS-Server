import {Transform} from 'class-transformer';
import {IsBoolean, IsIn, IsOptional, IsString, MaxLength} from 'class-validator';
import {PaginationDto} from 'src/common/dto/pagination.dto';
import {MODERATION_STATUSES, StoryStatus} from '../enums/story-status.enum';

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

  /**
   * When true, switch to the reported queue: member-reported stories only
   * (reportCount > 0), ordered most-reported first, regardless of status.
   * Query strings arrive as text, so map the literal 'true' rather than
   * trusting Boolean() (which is truthy for any non-empty string).
   */
  @IsOptional()
  @Transform(({value}) => value === 'true' || value === true)
  @IsBoolean()
  reported?: boolean;
}
