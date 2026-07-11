import {IsNotEmpty, IsString, Matches, MaxLength} from 'class-validator';

export class CreateTagDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  // The URL slug is derived from the name, so it must contain at least one
  // character that survives slugification.
  @Matches(/[a-zA-Z0-9]/, {
    message: 'name must contain at least one letter or number',
  })
  name: string;
}
