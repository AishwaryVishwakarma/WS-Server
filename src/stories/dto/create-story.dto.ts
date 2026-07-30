import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {IsClean} from 'src/common/moderation/is-clean.decorator';
import {ContentWarning} from '../enums/content-warning.enum';

export class CreateStoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  excerpt?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50000) // ~ 50KB
  content: string;

  @IsOptional()
  @IsUrl({
    max_allowed_length: 500,
  })
  coverImageUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  scareLevel?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('all', {each: true})
  @ArrayMaxSize(5)
  tags?: string[];

  /** Safety labels the reader should see before/while reading — a fixed
   *  vocabulary, distinct from `tags` (open-ended topics). */
  @IsOptional()
  @IsArray()
  @IsEnum(ContentWarning, {each: true})
  @ArrayMaxSize(6)
  contentWarnings?: ContentWarning[];

  /** Save privately instead of submitting to moderation. */
  @IsOptional()
  @IsBoolean()
  draft?: boolean;

  /**
   * The series this story belongs to, by title — find-or-create scoped to
   * this author (a free-text field doubles as "pick existing or create
   * new"). `null` detaches the story from any series; omitting the key
   * leaves an existing assignment untouched (see UpdateStoryDto).
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsClean()
  seriesTitle?: string | null;
}
