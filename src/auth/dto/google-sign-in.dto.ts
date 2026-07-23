import {IsNotEmpty, IsString} from 'class-validator';

export class GoogleSignInDto {
  // The ID token (a JWT) the Google Identity Services button hands the browser.
  @IsString()
  @IsNotEmpty()
  credential: string;
}
