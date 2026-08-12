import {Type} from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {StoryStatus} from 'src/stories/enums/story-status.enum';

export class AnalyticsQueryDto {
  @Type(() => Number)
  @IsInt()
  @IsIn([7, 30, 90])
  range = 30;

  @IsOptional()
  @IsDateString({strict: true})
  start?: string;

  @IsOptional()
  @IsDateString({strict: true})
  end?: string;

  @IsOptional() @IsEnum(StoryStatus) status?: StoryStatus;
  @IsOptional() @IsUUID() authorId?: string;
  @IsOptional() @IsString() @MaxLength(20) tag?: string;
}
