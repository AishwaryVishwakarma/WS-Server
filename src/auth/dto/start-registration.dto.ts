import {Equals} from 'class-validator';
import {RegisterUserDto} from 'src/users/dto/register-user.dto';

// Public registration adds explicit legal consent without leaking that
// transport-only requirement into admin user creation or profile updates.
export class StartRegistrationDto extends RegisterUserDto {
  @Equals(true, {
    message: 'You must agree to the Terms of Use and Privacy Policy',
  })
  acceptedTerms: boolean;
}
