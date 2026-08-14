import {Expose} from 'class-transformer';

export class SiteSettingsResponseDto {
  @Expose() requireStoryApproval: boolean;
  @Expose() allowProfileImageUpload: boolean;
  @Expose() allowStoryCoverImage: boolean;
  @Expose() digestEmailGloballyEnabled: boolean;
  @Expose() notificationEmailGloballyEnabled: boolean;
  @Expose() updatedAt: Date;

  constructor(partial: Partial<SiteSettingsResponseDto>) {
    Object.assign(this, partial);
  }
}
