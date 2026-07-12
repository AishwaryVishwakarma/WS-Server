import {IsEnum, IsOptional} from 'class-validator';
import {SearchPaginationDto} from 'src/common/dto/search-pagination.dto';
import {StoryStatus} from '../enums/story-status.enum';

// The author's own shelf: unlike the admin list, every status — including
// draft — is theirs to filter by.
export class MyStoriesQueryDto extends SearchPaginationDto {
  @IsOptional()
  @IsEnum(StoryStatus)
  status?: StoryStatus;
}
