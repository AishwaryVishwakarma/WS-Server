import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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

  /** Save privately instead of submitting to moderation. */
  @IsOptional()
  @IsBoolean()
  draft?: boolean;
}
