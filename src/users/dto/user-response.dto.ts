import {Exclude, Expose, Type} from 'class-transformer';
import {
  StoryPreviewResponseDto,
  StoryResponseDto,
} from 'src/stories/dto/story-response.dto';

export class UserPreviewResponseDto {
  @Expose() id: string;
  @Expose() name: string;
  @Expose() email: string;
  @Expose() profileImageUrl?: string;
  @Expose() bio?: string;
  @Expose() isVerified: boolean;

  @Exclude() password: string;

  constructor(partial: Partial<UserPreviewResponseDto>) {
    Object.assign(this, partial);
  }
}

export class UserWithStoryPreviewResponseDto extends UserPreviewResponseDto {
  @Expose()
  @Type(() => StoryPreviewResponseDto)
  stories: StoryPreviewResponseDto[];

  constructor(partial: Partial<UserWithStoryPreviewResponseDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}

export class UserWithStoryResponseDto extends UserPreviewResponseDto {
  @Expose()
  @Type(() => StoryResponseDto)
  stories: StoryResponseDto[];

  constructor(partial: Partial<UserWithStoryResponseDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}

export class UserResponseDto extends UserPreviewResponseDto {
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;
  @Expose() isAdmin: boolean;
  @Expose() isBlocked: boolean;
  @Expose() deletedAt?: Date;

  constructor(partial: Partial<UserResponseDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}
