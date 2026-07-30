import {IsEnum, IsOptional, IsString, MaxLength} from 'class-validator';
import {StoryReportReason} from '../enums/story-report-reason.enum';

export class ReportStoryDto {
  @IsEnum(StoryReportReason)
  reason: StoryReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  details?: string;
}
