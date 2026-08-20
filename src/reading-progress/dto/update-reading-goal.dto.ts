import {IsInt, Max, Min} from 'class-validator';

export class UpdateReadingGoalDto {
  @IsInt()
  @Min(1)
  @Max(14)
  goal: number;
}
