import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  content: string;

  @IsUUID()
  @IsNotEmpty()
  storyId: string;

  // Optional: when present, this comment is a reply. The service verifies the
  // parent belongs to the same story and re-roots replies-to-replies so the
  // thread never nests beyond one level.
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
