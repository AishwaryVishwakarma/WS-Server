import {Expose, Type} from 'class-transformer';
import {UserPreviewResponseDto} from 'src/users/dto/user-response.dto';

export class CommentPreviewResponseDto {
  @Expose() id: string;
  @Expose() content: string;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  @Expose()
  @Type(() => UserPreviewResponseDto)
  user: UserPreviewResponseDto;

  constructor(partial: Partial<CommentPreviewResponseDto>) {
    Object.assign(this, partial);
  }
}
