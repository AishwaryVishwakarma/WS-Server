import {IsBoolean} from 'class-validator';

export class UpdateSiteSettingsDto {
  @IsBoolean()
  requireStoryApproval: boolean;
}
