import {Body, Controller, HttpCode, Post} from '@nestjs/common';
import {Throttle} from '@nestjs/throttler';
import {PasswordResetService} from './password-reset.service';
import {ForgotPasswordDto} from './dto/forgot-password.dto';
import {ResetPasswordDto} from './dto/reset-password.dto';
import {AUTH_THROTTLE} from 'src/common/constants/throttle';

@Controller('auth')
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  // Always 204, whether or not the email is registered — see
  // PasswordResetService.requestReset for why a differing response would be
  // an account-enumeration leak.
  @Post('forgot-password')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(204)
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    await this.passwordResetService.requestReset(forgotPasswordDto.email);
  }

  @Post('reset-password')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(204)
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    await this.passwordResetService.resetPassword(
      resetPasswordDto.token,
      resetPasswordDto.password
    );
  }
}
