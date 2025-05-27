import {Expose, Type} from 'class-transformer';
import type {StoryStatus} from '../enums/story-status.enum';
import {TagResponseDto} from 'src/tags/dto/tag-response.dto';

/**
 * Author preview DTO [public]
 * This DTO is used to return a preview of the author
 * and can be used in the list of stories, story details or
 * the author details page
 */
class AuthorPreviewDto {
  @Expose() id: string;
  @Expose() name: string;
  @Expose() profileImageUrl?: string;
  @Expose() bio?: string;
  @Expose() isVerified: boolean;

  constructor(partial: Partial<AuthorPreviewDto>) {
    Object.assign(this, partial);
  }
}

/**
 * Story preview response DTO [public]
 * This DTO is used to return a preview of the story an can be used
 * in the list of stories without the content
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
 * Story with author preview response DTO [public]
 * This DTO is used to return a preview of the story with the author
 * and the content, can be used in the story details page
 */
export class StoryWithAuthorPreviewResponseDto extends StoryPreviewResponseDto {
  @Expose() content: string;

  @Expose()
  @Type(() => AuthorPreviewDto)
  author: AuthorPreviewDto;

  constructor(partial: Partial<StoryWithAuthorPreviewResponseDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}

/**
 * Story response DTO [admin, author]
 * This DTO is used to return the full story without the author
 * and can be used in to show the current users stories
 * and the admin panel
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
