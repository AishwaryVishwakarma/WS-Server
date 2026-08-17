import {Type} from 'class-transformer';
import {IsIn, IsInt} from 'class-validator';

export class StoryStatsQueryDto {
  // 180/365 are Patron+ only (StoriesService.getStoryDailyStats clamps a
  // Free requester back to 90) — validated here as the full set so a
  // member's client can request them without a separate DTO/endpoint.
  @Type(() => Number)
  @IsInt()
  @IsIn([7, 30, 90, 180, 365])
  days = 30;
}
