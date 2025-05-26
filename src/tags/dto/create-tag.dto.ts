import {IsNotEmpty, IsString, MaxLength} from 'class-validator';

export class CreateTagDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  name: string;
}
