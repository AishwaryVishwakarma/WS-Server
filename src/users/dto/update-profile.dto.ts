import {PartialType} from '@nestjs/mapped-types';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {ContentWarning} from 'src/stories/enums/content-warning.enum';
import {RegisterUserDto} from './register-user.dto';
import {
  NOTIFICATION_TYPES,
  type NotificationType,
} from 'src/notifications/notification.types';

export class UpdateProfileDto extends PartialType(RegisterUserDto) {
  // The reader's own "hide stories carrying these" preference — distinct
  // from a story's own contentWarnings. Not privileged (unlike role/
  // isVerified/isBlocked, which this self-service DTO family excludes), so
  // it's a plain pass-through field like bio.
  @IsOptional()
  @IsArray()
  @IsEnum(ContentWarning, {each: true})
  @ArrayMaxSize(6)
  mutedContentWarnings?: ContentWarning[];

  // Opt-out of the weekly digest email (see DigestService). Not privileged,
  // same pass-through treatment as mutedContentWarnings.
  @IsOptional()
  @IsBoolean()
  digestEmailEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsEnum(NOTIFICATION_TYPES, {each: true})
  @ArrayMaxSize(4)
  notificationInAppTypes?: NotificationType[];

  @IsOptional()
  @IsArray()
  @IsEnum(NOTIFICATION_TYPES, {each: true})
  @ArrayMaxSize(4)
  notificationEmailTypes?: NotificationType[];

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  notificationQuietStart?: string | null;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  notificationQuietEnd?: string | null;

  @IsOptional()
  @IsInt()
  @Min(-840)
  @Max(840)
  notificationTimezoneOffset?: number;
}
