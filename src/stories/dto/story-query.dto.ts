import {Transform, Type} from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
  'most-read',
  'most-liked',
  'trending',
] as const;
export type StorySortOption = (typeof STORY_SORT_OPTIONS)[number];

export class StoryQueryDto extends PaginationDto {
  // Override PaginationDto.page to drop its default of 1. `GET /stories` is
  // dual-mode: an explicit `page` selects offset paging (tag/author shelves,
  // which show numbered pages), while its *absence* selects keyset (cursor)
  // paging for the infinite feed — O(index-seek) instead of a growing OFFSET
  // scan. Redeclaring here re-applies the validation metadata (decorators
  // don't carry over an override).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  page?: number = undefined;

  /**
   * Opaque keyset cursor (see story-cursor.ts). When present, returns the page
   * of stories immediately after it under the active `sort`. Ignored in offset
   * mode (when `page` is set).
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  /** Tag slug (see Tag.normalizeName) — filters to stories carrying the tag.
   *  Single-tag only; used by the /tags/:slug shelf page. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  tag?: string;

  /** Tag slugs, comma-separated — the /stories feed's multi-select filter.
   *  OR semantics: a story matching any one of these matches. Distinct
   *  from `tag` above (that one stays single-slug for the shelf page);
   *  capped at 5 to match TagPicker's own selection limit. */
  @IsOptional()
  @Transform(({value}: {value: unknown}) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value
  )
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({each: true})
  @MaxLength(20, {each: true})
  tags?: string[];

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
