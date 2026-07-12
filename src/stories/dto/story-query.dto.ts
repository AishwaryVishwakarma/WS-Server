import {Type} from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {PaginationDto} from 'src/common/dto/pagination.dto';

export const STORY_SORT_OPTIONS = [
  'newest',
  'oldest',
  'most-commented',
] as const;
export type StorySortOption = (typeof STORY_SORT_OPTIONS)[number];

export class StoryQueryDto extends PaginationDto {
  /** Tag slug (see Tag.normalizeName) — filters to stories carrying the tag. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  tag?: string;

  /** Case-insensitive substring match against title and excerpt. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  scareLevel?: number;

  @IsOptional()
  @IsIn(STORY_SORT_OPTIONS)
  sort?: StorySortOption = 'newest';
}
