import {Transform} from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({value}: {value: unknown}) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateSeasonalEventDto {
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  title: string;

  @Transform(trim)
  @IsString()
  @MaxLength(240)
  description: string;

  @IsInt()
  @Min(1)
  @Max(25)
  goal: number;

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;

  @IsBoolean()
  isPublished: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsUUID('4', {each: true})
  tagIds: string[];
}
