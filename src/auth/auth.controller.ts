import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  BadRequestException,
  Get,
  UseGuards,
} from '@nestjs/common';
import {AuthService} from './auth.service';
import {LoginInfoDto} from './dto/login-info.dto';
import type {Request} from 'express';
import {RegisterUserDto} from 'src/users/dto/register-user.dto';
import {User} from 'src/users/entities/user.entity';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {plainToInstance} from 'class-transformer';
import {
  UserPreviewResponseDto,
  UserResponseDto,
} from 'src/users/dto/user-response.dto';
import {Role} from 'src/users/enums/role';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
  getCsrfToken(@Req() req: Request) {
    try {
      return {csrfToken: req.csrfToken()};
    } catch {
      throw new BadRequestException('Could not generate CSRF token');
    }
  }

  @Post('register')
  @HttpCode(201)
  async register(
    @Body() registerUserDto: RegisterUserDto,
    @Req() req: Request
  ) {
    if (req.session.userId) throw new BadRequestException('Already logged in');

    const user = await this.authService.register(registerUserDto, req);
    return this._serialize(user, req.session.role);
  }

  @Post('login')
  async login(@Body() loginInfoDto: LoginInfoDto, @Req() req: Request) {
    if (req.session.userId) throw new BadRequestException('Already logged in');

    const user = await this.authService.login(loginInfoDto, req);
    return this._serialize(user, req.session.role);
  }

  @Post('logout')
  @UseGuards(SessionAuthGuard)
  @HttpCode(204)
  logout(@Req() req: Request) {
    return this.authService.logout(req);
  }
}
