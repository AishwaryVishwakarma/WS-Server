import {Injectable, UnauthorizedException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {User} from 'src/users/entities/user.entity';
import {Repository} from 'typeorm';
import {LoginInfoDto} from './dto/login-info.dto';
import * as bcrypt from 'bcrypt';
import {RegisterUserDto} from 'src/users/dto/register-user.dto';
import type {Request} from 'express';
import {SessionService} from 'src/session/session.service';
import {SessionRegistryService} from 'src/session/session-registry.service';
import {
  REMEMBER_ME_MAX_AGE_MS,
  SESSION_MAX_AGE_MS,
} from 'src/session/session.constants';
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
    private readonly sessionRegistryService: SessionRegistryService,
    private readonly googleAuthService: GoogleAuthService
  ) {}

  // Shared by register/login/googleSignIn: regenerate the session id, stamp
  // the identity, then record the new sid against the user so a later
  // password reset (see PasswordResetService) can find and destroy it.
  // `rememberMe` (login only) swaps the cookie's default 1-day maxAge for a
  // 30-day one; the index tracks the same effective duration so it stays
  // discoverable for the session's whole real lifetime.
  private async _establishSession(
    req: Request,
    user: User,
    rememberMe = false
  ): Promise<void> {
    await this.sessionService.regenerate(req);

    req.session.userId = user.id;
    req.session.role = user.role || Role.User;

    const maxAgeMs = rememberMe ? REMEMBER_ME_MAX_AGE_MS : SESSION_MAX_AGE_MS;
    if (rememberMe) req.session.cookie.maxAge = maxAgeMs;

    await this.sessionRegistryService.track(user.id, req.sessionID, maxAgeMs);
  }

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

    await this._establishSession(req, user);

    return user;
  }

  async login(loginInfoDto: LoginInfoDto, req: Request) {
    const user = await this.validateUser(loginInfoDto);

    await this._establishSession(req, user, loginInfoDto.rememberMe);

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

    await this._establishSession(req, user);

    return user;
  }

  async logout(req: Request) {
    const userId = req.session.userId;
    const sid = req.sessionID;

    await this.sessionService.destroy(req);

    if (userId) await this.sessionRegistryService.untrack(userId, sid);
  }
}
