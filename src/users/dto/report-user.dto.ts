import {IsEnum, IsOptional, IsString, MaxLength} from 'class-validator';
import {ReportReason} from '../enums/report-reason.enum';

export class ReportUserDto {
  @IsEnum(ReportReason)
  reason: ReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  details?: string;
}
