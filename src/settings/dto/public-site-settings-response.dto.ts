import {Expose} from 'class-transformer';

// Public read — deliberately excludes updatedAt (no reason to expose it
// outside the admin panel).
export class PublicSiteSettingsResponseDto {
  @Expose() requireStoryApproval: boolean;
  @Expose() allowProfileImageUpload: boolean;
  @Expose() allowStoryCoverImage: boolean;

  constructor(partial: Partial<PublicSiteSettingsResponseDto>) {
    Object.assign(this, partial);
  }
}
