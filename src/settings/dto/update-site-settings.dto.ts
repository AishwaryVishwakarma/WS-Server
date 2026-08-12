import {IsBoolean, IsOptional} from 'class-validator';

export class UpdateSiteSettingsDto {
  @IsOptional()
  @IsBoolean()
  requireStoryApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  allowProfileImageUpload?: boolean;

  @IsOptional()
  @IsBoolean()
  allowStoryCoverImage?: boolean;

  @IsOptional()
  @IsBoolean()
  digestEmailGloballyEnabled?: boolean;
}
