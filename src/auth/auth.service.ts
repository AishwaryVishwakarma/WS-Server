import {Injectable, UnauthorizedException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {User} from 'src/users/entities/user.entity';
import {Repository} from 'typeorm';
import {LoginInfoDto} from './dto/login-info.dto';
import * as bcrypt from 'bcrypt';
import {RegisterUserDto} from 'src/users/dto/register-user.dto';
import type {Request} from 'express';
import {SessionService} from 'src/session/session.service';
import {Role} from 'src/users/enums/role';
import {UsersService} from 'src/users/users.service';
import {GoogleAuthService} from './google-auth.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly usersService: UsersService,
    private readonly sessionService: SessionService,
    private readonly googleAuthService: GoogleAuthService
  ) {}

  async validateUser(loginInfoDto: LoginInfoDto) {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password') // Ensure password is selected
      .where('user.email = :email', {
        email: loginInfoDto.email,
      })
      .getOne();

    // `user.password` is null for OAuth-only accounts — they can't sign in with
    // a password, so treat a missing hash as invalid rather than feeding null
    // to bcrypt (which throws).
    if (
      user &&
      user.password &&
      (await bcrypt.compare(loginInfoDto.password, user.password))
    ) {
      if (user.isBlocked) {
        throw new UnauthorizedException('User is blocked');
      }

      return user;
    }

    throw new UnauthorizedException('Invalid credentials');
  }

  async register(registerUserDto: RegisterUserDto, req: Request) {
    const user = (await this.usersService.create(registerUserDto)) as User;

    await this.sessionService.regenerate(req);

    req.session.userId = user.id;
    req.session.role = user.role || Role.User;

    return user;
  }

  async login(loginInfoDto: LoginInfoDto, req: Request) {
    const user = await this.validateUser(loginInfoDto);

    await this.sessionService.regenerate(req);

    req.session.userId = user.id;
    req.session.role = user.role || Role.User;

    return user;
  }

  // Sign in (or up) with a Google ID token from the GIS button. Verify it,
  // require a Google-verified email (so email-based account linking is safe),
  // resolve/create the account, then establish the session exactly like a
  // password login.
  async googleSignIn(credential: string, req: Request) {
    const profile = await this.googleAuthService.verify(credential);

    if (!profile.emailVerified) {
      throw new UnauthorizedException('Your Google email is not verified');
    }

    const user = await this.usersService.findOrCreateGoogleUser(profile);

    if (user.isBlocked) {
      throw new UnauthorizedException('User is blocked');
    }

    await this.sessionService.regenerate(req);

    req.session.userId = user.id;
    req.session.role = user.role || Role.User;

    return user;
  }

  async logout(req: Request) {
    await this.sessionService.destroy(req);
  }
}
