import {
  ArrayMaxSize,
  IsArray,
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
  title: string;

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
}
