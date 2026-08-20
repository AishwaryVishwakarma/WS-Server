import {Expose} from 'class-transformer';

// Public read — deliberately excludes updatedAt (no reason to expose it
// outside the admin panel).
export class PublicSiteSettingsResponseDto {
  @Expose() requireStoryApproval: boolean;
  @Expose() allowProfileImageUpload: boolean;
  @Expose() allowStoryCoverImage: boolean;
  // Members use this to hide a preference that currently has no effect.
  @Expose() digestEmailGloballyEnabled: boolean;
  // Lets account settings hide controls for a globally disabled channel.
  @Expose() notificationEmailGloballyEnabled: boolean;
  // Lets the frontend hide membership UI entirely while the feature is
  // being staged, even for accounts an admin has already granted a tier to.
  @Expose() membershipFeaturesEnabled: boolean;
  // Members use this to hide a preference that currently has no effect.
  @Expose() winbackEmailGloballyEnabled: boolean;
  // Lets /register hide the referral-code field while the program is off.
  @Expose() referralProgramEnabled: boolean;

  constructor(partial: Partial<PublicSiteSettingsResponseDto>) {
    Object.assign(this, partial);
  }
}
