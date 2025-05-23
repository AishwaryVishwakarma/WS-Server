import {Exclude, Expose, Type} from 'class-transformer';
import {
  StoryPreviewResponseDto,
  StoryResponseDto,
} from 'src/stories/dto/story-response.dto';

/**
 * User preview response DTO [public]
 * This DTO is used to return a preview of the user
 * and can be used in the list of users or the user profile
 */
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

/**
 * User with story preview response DTO [public]
 * This DTO is used to return a preview of the user
 * and the stories, can be used in the user profile to show
 * the stories of the user without the content
 */
export class UserWithStoryPreviewResponseDto extends UserPreviewResponseDto {
  @Expose()
  @Type(() => StoryPreviewResponseDto)
  stories: StoryPreviewResponseDto[];

  constructor(partial: Partial<UserWithStoryPreviewResponseDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}

/**
 * User response DTO [author]
 * This DTO is used to return the user with the stories
 * and can be used in the user profile to show
 * the stories of the user with the content
 */
export class UserWithStoryResponseDto extends UserPreviewResponseDto {
  @Expose()
  @Type(() => StoryResponseDto)
  stories: StoryResponseDto[];

  constructor(partial: Partial<UserWithStoryResponseDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}

/**
 * User response DTO [admin]
 * This DTO is used to return the user without the stories
 * and can be used in the admin panel to show the users
 */
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
