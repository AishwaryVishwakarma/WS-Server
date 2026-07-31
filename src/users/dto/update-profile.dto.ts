import {PartialType} from '@nestjs/mapped-types';
import {ArrayMaxSize, IsArray, IsEnum, IsOptional} from 'class-validator';
import {ContentWarning} from 'src/stories/enums/content-warning.enum';
import {RegisterUserDto} from './register-user.dto';

export class UpdateProfileDto extends PartialType(RegisterUserDto) {
  // The reader's own "hide stories carrying these" preference — distinct
  // from a story's own contentWarnings. Not privileged (unlike role/
  // isVerified/isBlocked, which this self-service DTO family excludes), so
  // it's a plain pass-through field like bio/profileImageUrl.
  @IsOptional()
  @IsArray()
  @IsEnum(ContentWarning, {each: true})
  @ArrayMaxSize(6)
  mutedContentWarnings?: ContentWarning[];
}
