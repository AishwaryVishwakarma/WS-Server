import {Injectable, NotFoundException} from '@nestjs/common';
import {RegisterUserDto} from './dto/register-user.dto';
import {UpdateUserDto} from './dto/update-user.dto';
import {InjectRepository} from '@nestjs/typeorm';
import {User} from './entities/user.entity';
import {QueryFailedError, Repository} from 'typeorm';
import {ConfigService} from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import {paginate} from 'src/utils/pagination';
import {handleQueryFailedError} from 'src/utils/handle-query-error';

@Injectable()
export class UsersService {
  // Inject the User repository to interact with the database
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly configService: ConfigService
  ) {}

  // Hash the password using bcrypt
  private _generateHash(password: string) {
    const saltRounds = parseInt(
      this.configService.get<string>('SALT_ROUNDS') || '10'
    );

    return bcrypt.hash(password, saltRounds);
  }

  // Update the user entity with the new data
  private async _applyUserUpdates(user: User, updateUserDto: UpdateUserDto) {
    const {password, ...rest} = updateUserDto;
    Object.assign(user, rest);

    if (password) {
      user.password = await this._generateHash(password);
    }

    try {
      return await this.usersRepository.save(user);
    } catch (error) {
      handleQueryFailedError(error, 'update');
    }
  }

  // Accepts RegisterUserDto (self-registration) or CreateUserDto (admin, extends it)
  async create(createUserDto: RegisterUserDto) {
    const hashedPassword = await this._generateHash(createUserDto.password);

    const user = this.usersRepository.create({
      ...createUserDto,
      password: hashedPassword,
    });

    try {
      return await this.usersRepository.save(user);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        handleQueryFailedError(error, 'create');
      }
    }
  }

  async findAll(page: number = 1, limit: number = 20) {
    const {skip, take} = paginate(page, limit);

    const [users, total] = await this.usersRepository.findAndCount({
      skip,
      take,
      withDeleted: true,
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
    return this.usersRepository.findOneByOrFail({id}).catch(() => {
      throw new NotFoundException(`User with ID ${id} not found`);
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.findOne(id);
    return this._applyUserUpdates(user, updateUserDto);
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
