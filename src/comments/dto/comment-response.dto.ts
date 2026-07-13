import {Expose, Type} from 'class-transformer';
import {UserPreviewResponseDto} from 'src/users/dto/user-response.dto';

export class CommentPreviewResponseDto {
  @Expose() id: string;
  @Expose() content: string;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  // Present on top-level comments (mapped by loadRelationCountAndMap); omitted
  // on reply rows, which never carry their own replies.
  @Expose() replyCount?: number;

  @Expose()
  @Type(() => UserPreviewResponseDto)
  user: UserPreviewResponseDto;

  constructor(partial: Partial<CommentPreviewResponseDto>) {
    Object.assign(this, partial);
  }
}
