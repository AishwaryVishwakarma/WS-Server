import {
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
  @IsUUID()
  authorId: string;

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
  @IsString({each: true})
  tags?: string[];
}
