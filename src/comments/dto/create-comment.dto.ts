import {IsNotEmpty, IsString, IsUUID, MaxLength} from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  content: string;

  @IsUUID()
  @IsNotEmpty()
  storyId: string;
}
