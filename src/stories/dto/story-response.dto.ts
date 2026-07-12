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
  @Expose() wordCount: number;
  @Expose() commentCount: number;
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
 * [public] — status is exposed but harmless: anonymous readers only ever see
 * approved stories (findOneVisible 404s the rest), while authors reading
 * their own work need it to know draft/pending/rejected state.
 */
export class StoryWithAuthorPreviewResponseDto extends StoryPreviewResponseDto {
  @Expose() content: string;
  @Expose() status: StoryStatus;

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
