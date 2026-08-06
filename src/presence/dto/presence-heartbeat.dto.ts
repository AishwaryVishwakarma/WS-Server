import {IsNotEmpty, IsString, MaxLength} from 'class-validator';

export class PresenceHeartbeatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  tabId: string;
}
