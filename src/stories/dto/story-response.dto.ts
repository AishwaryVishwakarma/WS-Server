import {Expose, Type} from 'class-transformer';
import type {StoryStatus} from '../enums/story-status.enum';
import {TagResponseDto} from 'src/tags/dto/tag-response.dto';
import {UserPreviewResponseDto} from 'src/users/dto/user-response.dto';

/**
 * [public]
 */
export class StoryPreviewResponseDto {
  @Expose() id: string;
  @Expose() title: string;
  @Expose() coverImageUrl?: string;
  @Expose() scareLevel: number;
  @Expose() excerpt: string;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  @Expose()
  @Type(() => TagResponseDto)
  tags: TagResponseDto[];

  constructor(partial: Partial<StoryPreviewResponseDto>) {
    Object.assign(this, partial);
  }
}

/**
 * [public]
 */
export class StoryWithAuthorPreviewResponseDto extends StoryPreviewResponseDto {
  @Expose() content: string;

  @Expose()
  @Type(() => UserPreviewResponseDto)
  author: UserPreviewResponseDto;

  constructor(partial: Partial<StoryWithAuthorPreviewResponseDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}

/**
 * [private, admin]
 */
export class StoryResponseDto extends StoryPreviewResponseDto {
  @Expose() content: string;
  @Expose() isFlagged: boolean;
  @Expose() status: StoryStatus;

  constructor(partial: Partial<StoryResponseDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}
