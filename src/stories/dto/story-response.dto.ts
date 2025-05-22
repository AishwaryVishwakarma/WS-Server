import {Expose, Type} from 'class-transformer';
import type {StoryStatus} from '../enums/story-status.enum';

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

export class StoryPreviewResponseDto {
  @Expose() id: string;
  @Expose() title: string;
  @Expose() coverImageUrl?: string;
  @Expose() scareLevel: number;
  @Expose() tags: string[];
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  constructor(partial: Partial<StoryPreviewResponseDto>) {
    Object.assign(this, partial);
  }
}

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

export class StoryResponseDto extends StoryPreviewResponseDto {
  @Expose() content: string;
  @Expose() isFlagged: boolean;
  @Expose() status: StoryStatus;

  constructor(partial: Partial<StoryResponseDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}
