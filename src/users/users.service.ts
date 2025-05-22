import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {CreateUserDto} from './dto/create-user.dto';
import {UpdateUserDto} from './dto/update-user.dto';
import {InjectRepository} from '@nestjs/typeorm';
import {User} from './entities/user.entity';
import {QueryFailedError, Repository} from 'typeorm';
import {ConfigService} from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import {paginate} from 'src/utils/pagination';
import {SessionService} from 'src/session/session.service';
import type {Request} from 'express';

@Injectable()
export class UsersService {
  // Inject the User repository to interact with the database
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly configService: ConfigService,
    private readonly sessionService: SessionService
  ) {}

  private _handleQueryFailedError(error: unknown, action: string) {
    if (error instanceof QueryFailedError) {
      // MySQL error code for duplicate entry: 1062
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if ((error as any).code === 'ER_DUP_ENTRY') {
        throw new ConflictException('Email already exists');
      }

      throw new InternalServerErrorException(`Failed to ${action} user`);
    }

    throw error;
  }

  // Hash the password using bcrypt
  private _generateHash(password: string) {
    const saltRounds = parseInt(
      this.configService.get<string>('SALT_ROUNDS') || '10'
    );

    return bcrypt.hash(password, saltRounds);
  }

  // Update the user entity with the new data
  private async _updateUserEntity(user: User, updateUserDto: UpdateUserDto) {
    const {password, ...rest} = updateUserDto;
    Object.assign(user, rest);

    if (password) {
      user.password = await this._generateHash(password);
    }

    try {
      return await this.usersRepository.save(user);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        this._handleQueryFailedError(error, 'update');
      }
    }
  }

  async create(createUserDto: CreateUserDto) {
    const hashedPassword = await this._generateHash(createUserDto.password);

    const user = this.usersRepository.create({
      ...createUserDto,
      password: hashedPassword,
    });

    try {
      return await this.usersRepository.save(user);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        this._handleQueryFailedError(error, 'create');
      }
    }
  }

  async findAll(page: number = 1, limit: number = 20) {
    const {skip, take} = paginate(page, limit);

    const [users, total] = await this.usersRepository.findAndCount({
      skip,
      take,
    });

    return {
      message: 'Success',
      data: users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const user = await this.usersRepository.findOneBy({id});

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async findMe(req: Request) {
    return this.findOne(req.session.userId!);
  }

  async updateMe(updateUserDto: UpdateUserDto, req: Request) {
    if (req.session.isAdmin && !updateUserDto.isAdmin) {
      throw new ConflictException(
        'You cannot remove admin privileges from yourself'
      );
    }

    const user = await this.findOne(req.session.userId!);
    return this._updateUserEntity(user, updateUserDto);
  }

  async update(id: string, updateUserDto: UpdateUserDto, req: Request) {
    if (req.session.userId === id) {
      return this.updateMe(updateUserDto, req);
    }

    const user = await this.findOne(id);
    return this._updateUserEntity(user, updateUserDto);
  }

  async removeMe(req: Request) {
    const result = await this.usersRepository.softDelete(req.session.userId!);

    if (result.affected === 0) {
      throw new NotFoundException(
        `User with ID ${req.session.userId} not found`
      );
    }

    return this.sessionService.destroy(req);
  }

  async remove(id: string) {
    const result = await this.usersRepository.softDelete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
  }

  async restore(id: string) {
    const result = await this.usersRepository.restore(id);

    if (result.affected === 0) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
  }
}
