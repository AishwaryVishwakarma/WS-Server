import {Injectable, UnauthorizedException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {User} from 'src/users/entities/user.entity';
import type {Repository} from 'typeorm';
import {LoginInfoDto} from './dto/login-info.dto';
import * as bcrypt from 'bcrypt';
import {CreateUserDto} from 'src/users/dto/create-user.dto';
import type {Request} from 'express';
import {UsersService} from 'src/users/users.service';
import {SessionService} from 'src/session/session.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly usersService: UsersService,
    private readonly sessionService: SessionService
  ) {}

  async validateUser(loginInfoDto: LoginInfoDto) {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password') // Ensure password is selected
      .where('user.email = :email', {
        email: loginInfoDto.email,
      })
      .getOne();

    if (user && (await bcrypt.compare(loginInfoDto.password, user.password))) {
      if (user.isBlocked) {
        throw new UnauthorizedException('User is blocked');
      }

      return user;
    }

    throw new UnauthorizedException('Invalid credentials');
  }

  async register(createUserDto: CreateUserDto, req: Request) {
    const user = (await this.usersService.create(createUserDto)) as User;

    await this.sessionService.regenerate(req);

    req.session.userId = user.id;
    req.session.isAdmin = user.isAdmin || false;

    return user;
  }

  async login(loginInfoDto: LoginInfoDto, req: Request) {
    const user = await this.validateUser(loginInfoDto);

    await this.sessionService.regenerate(req);

    req.session.userId = user.id;
    req.session.isAdmin = user.isAdmin || false;

    return user;
  }

  async logout(req: Request) {
    await this.sessionService.destroy(req);
  }
}
