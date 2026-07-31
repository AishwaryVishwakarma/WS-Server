import {Type} from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Deliberately not `extends PaginationDto` — its `page` field doesn't apply
// here; the For You feed is keyset-only, no numbered-page mode.
export class ForYouQueryDto {
  /** Opaque keyset cursor (see story-cursor.ts). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
