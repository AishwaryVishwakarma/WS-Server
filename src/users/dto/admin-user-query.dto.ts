import {Transform} from 'class-transformer';
import {IsBoolean, IsOptional} from 'class-validator';
import {SearchPaginationDto} from 'src/common/dto/search-pagination.dto';

export class AdminUserQueryDto extends SearchPaginationDto {
  /**
   * When true, switch to the reported queue: member-reported users only
   * (reportCount > 0), ordered most-reported first. Query strings arrive as
   * text, so map the literal 'true' rather than trusting Boolean() (which is
   * truthy for any non-empty string).
   */
  @IsOptional()
  @Transform(({value}) => value === 'true' || value === true)
  @IsBoolean()
  reported?: boolean;
}
