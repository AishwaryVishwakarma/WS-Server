import {Expose} from 'class-transformer';

export class SiteSettingsResponseDto {
  @Expose() requireStoryApproval: boolean;
  @Expose() updatedAt: Date;

  constructor(partial: Partial<SiteSettingsResponseDto>) {
    Object.assign(this, partial);
  }
}
