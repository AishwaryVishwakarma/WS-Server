import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  HttpCode,
  BadRequestException,
  Get,
  UseGuards,
} from '@nestjs/common';
import {AuthService} from './auth.service';
import {LoginInfoDto} from './dto/login-info.dto';
import {GoogleSignInDto} from './dto/google-sign-in.dto';
import {ConfirmRegistrationDto} from './dto/confirm-registration.dto';
import {ResendRegistrationDto} from './dto/resend-registration.dto';
import {RegistrationOtpService} from './registration-otp.service';
import type {Request, Response} from 'express';
import {RegisterUserDto} from 'src/users/dto/register-user.dto';
import {User} from 'src/users/entities/user.entity';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {ApiCookieAuth} from '@nestjs/swagger';
import {Throttle} from '@nestjs/throttler';
import {generateCsrfToken} from 'src/middlewares/csrf';
import {AUTH_THROTTLE} from 'src/common/constants/throttle';
import {plainToInstance} from 'class-transformer';
import {
  UserPreviewResponseDto,
  UserResponseDto,
} from 'src/users/dto/user-response.dto';
import {Role} from 'src/users/enums/role';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly registrationOtpService: RegistrationOtpService
  ) {}

  private _serialize(user: User, role: Role = Role.User) {
    return plainToInstance(
      role === Role.Admin ? UserResponseDto : UserPreviewResponseDto,
      user,
      {
        excludeExtraneousValues: true,
      }
    );
  }

  @Get('csrf-token')
  getCsrfToken(@Req() req: Request, @Res({passthrough: true}) res: Response) {
    try {
      // Sets the CSRF cookie on res and returns the matching header token,
      // both bound to the current session id
      return {csrfToken: generateCsrfToken(req, res)};
    } catch {
      throw new BadRequestException('Could not generate CSRF token');
    }
  }

  // Starts the OTP flow — no account or session is created here. See
  // confirm below, which is what actually returns a SessionUser.
  @Post('register')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(204)
  async register(
    @Body() registerUserDto: RegisterUserDto,
    @Req() req: Request
  ) {
    if (await this.authService.hasActiveSession(req)) {
      throw new BadRequestException('Already logged in');
    }

    await this.authService.register(registerUserDto);
  }

  @Post('register/confirm')
  @Throttle(AUTH_THROTTLE)
  async confirmRegistration(
    @Body() confirmRegistrationDto: ConfirmRegistrationDto,
    @Req() req: Request
  ) {
    if (await this.authService.hasActiveSession(req)) {
      throw new BadRequestException('Already logged in');
    }

    const user = await this.authService.confirmRegistration(
      confirmRegistrationDto.email,
      confirmRegistrationDto.code,
      req
    );
    return this._serialize(user, req.session.role);
  }

  @Post('register/resend')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(204)
  async resendRegistration(
    @Body() resendRegistrationDto: ResendRegistrationDto
  ) {
    await this.registrationOtpService.resend(resendRegistrationDto.email);
  }

  @Post('login')
  @Throttle(AUTH_THROTTLE)
  async login(@Body() loginInfoDto: LoginInfoDto, @Req() req: Request) {
    if (await this.authService.hasActiveSession(req)) {
      throw new BadRequestException('Already logged in');
    }

    const user = await this.authService.login(loginInfoDto, req);
    return this._serialize(user, req.session.role);
  }

  // Sign in / up with Google. CSRF-exempt like login/register (a first sign-in
  // has no session yet to bind a token to); the ID token is the credential.
  @Post('google')
  @Throttle(AUTH_THROTTLE)
  async google(@Body() googleSignInDto: GoogleSignInDto, @Req() req: Request) {
    if (await this.authService.hasActiveSession(req)) {
      throw new BadRequestException('Already logged in');
    }

    const user = await this.authService.googleSignIn(
      googleSignInDto.credential,
      req
    );
    return this._serialize(user, req.session.role);
  }

  @Post('logout')
  @ApiCookieAuth('session')
  @UseGuards(SessionAuthGuard)
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({passthrough: true}) res: Response) {
    await this.authService.logout(req);
    // Reads are public now, so a lingering cookie would keep passing the
    // frontend's cheap "has a session cookie" checks after sign-out
    res.clearCookie('connect.sid');
  }
}
