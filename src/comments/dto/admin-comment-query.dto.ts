import {Transform} from 'class-transformer';
import {IsBoolean, IsOptional} from 'class-validator';
import {SearchPaginationDto} from 'src/common/dto/search-pagination.dto';

export class AdminCommentQueryDto extends SearchPaginationDto {
  /**
   * When true, narrow the list to the moderation queue: reported comments
   * only, ordered most-reported first. Query strings arrive as text, so map
   * the literal 'true' rather than trusting Boolean() (which is truthy for
   * any non-empty string, including 'false').
   */
  @IsOptional()
  @Transform(({value}) => value === 'true' || value === true)
  @IsBoolean()
  flagged?: boolean;
}
