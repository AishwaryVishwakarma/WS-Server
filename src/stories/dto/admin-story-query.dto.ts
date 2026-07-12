import {IsEnum, IsOptional, IsString, MaxLength} from 'class-validator';
import {PaginationDto} from 'src/common/dto/pagination.dto';
import {StoryStatus} from '../enums/story-status.enum';

export class AdminStoryQueryDto extends PaginationDto {
  /** Narrow the moderation list to one status (e.g. the pending queue). */
  @IsOptional()
  @IsEnum(StoryStatus)
  status?: StoryStatus;

  /** Case-insensitive substring match against title and excerpt. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
