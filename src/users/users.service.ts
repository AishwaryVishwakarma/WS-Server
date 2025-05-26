import {ConflictException, Injectable, NotFoundException} from '@nestjs/common';
import {CreateUserDto} from './dto/create-user.dto';
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
        handleQueryFailedError(error, 'create');
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

  async findMe(userId: string) {
    return this.findOne(userId, true);
  }

  async findOne(id: string, includeStories: boolean = false) {
    const query = this.usersRepository
      .createQueryBuilder('user')
      .where('user.id = :id', {id});

    if (includeStories) {
      query
        .leftJoinAndSelect('user.stories', 'story')
        .addSelect([
          'story.id',
          'story.title',
          'story.coverImageUrl',
          'story.scareLevel',
          'story.isFlagged',
          'story.status',
          'story.createdAt',
          'story.updatedAt',
        ]);
    }

    return await query.getOneOrFail().catch(() => {
      throw new NotFoundException(`User with ID ${id} not found`);
    });
  }

  async updateMe(
    updateUserDto: UpdateUserDto,
    userId: string,
    isAdmin: boolean
  ) {
    if (isAdmin && !updateUserDto.isAdmin) {
      throw new ConflictException(
        'You cannot remove admin privileges from yourself'
      );
    }

    const user = await this.findOne(userId);
    return this._applyUserUpdates(user, updateUserDto);
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    userId: string,
    isAdmin: boolean
  ) {
    if (userId === id) {
      return this.updateMe(updateUserDto, userId, isAdmin);
    }

    const user = await this.findOne(id);
    return this._applyUserUpdates(user, updateUserDto);
  }

  async removeMe(userId: string) {
    const result = await this.usersRepository.softDelete(userId);

    if (result.affected === 0) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
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
