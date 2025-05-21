import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  BadRequestException,
  Get,
} from '@nestjs/common';
import {AuthService} from './auth.service';
import {LoginInfoDto} from './dto/login-info.dto';
import type {Request} from 'express';
import {UsersService} from 'src/users/users.service';
import {CreateUserDto} from 'src/users/dto/create-user.dto';
import {serializeUser} from 'src/utils/serialization';
import {User} from 'src/users/entities/user.entity';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService
  ) {}

  private _serialize(user: User, isAdmin: boolean = false) {
    return serializeUser(user, isAdmin);
  }

  @Get('csrf-token')
  getCsrfToken(@Req() req: Request) {
    try {
      return {csrfToken: req.csrfToken()};
    } catch {
      throw new BadRequestException('Could not generate CSRF token');
    }
  }

  @Get('me')
  async getSession(@Req() req: Request) {
    if (!req.session.userId) throw new BadRequestException('Not logged in');

    const user = await this.usersService.findOne(req.session.userId);
    return this._serialize(user, req.session.isAdmin);
  }

  @Post('register')
  @HttpCode(201)
  async register(@Body() createUserDto: CreateUserDto, @Req() req: Request) {
    if (req.session.userId) throw new BadRequestException('Already logged in');

    const user = await this.authService.register(createUserDto, req);
    return this._serialize(user, req.session.isAdmin);
  }

  @Post('login')
  async login(@Body() loginInfoDto: LoginInfoDto, @Req() req: Request) {
    if (req.session.userId) throw new BadRequestException('Already logged in');

    const user = await this.authService.login(loginInfoDto, req);
    return this._serialize(user, req.session.isAdmin);
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Req() req: Request) {
    if (!req.session.userId) throw new BadRequestException('Not logged in');

    return this.authService.logout(req);
  }
}
