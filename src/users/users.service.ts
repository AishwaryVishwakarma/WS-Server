import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {RegisterUserDto} from './dto/register-user.dto';
import {UpdateUserDto} from './dto/update-user.dto';
import {InjectRepository} from '@nestjs/typeorm';
import {User} from './entities/user.entity';
import {Like, Repository, type FindOptionsWhere} from 'typeorm';
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
      // handleQueryFailedError maps duplicates to 409 and re-throws anything
      // else — never swallow, or create() would return undefined and callers
      // (register/admin create) would respond 201 with an empty body.
      return handleQueryFailedError(error, 'create');
    }
  }

  // Resolve the account for a verified Google profile: by googleId if already
  // linked, else link the Google identity onto an existing same-email (password)
  // account, else create a fresh OAuth-only account (no password). The caller
  // (AuthService) enforces email_verified before this runs.
  async findOrCreateGoogleUser(profile: {
    googleId: string;
    email: string;
    name: string;
    picture?: string;
  }): Promise<User> {
    const byGoogleId = await this.usersRepository.findOne({
      where: {googleId: profile.googleId},
    });
    if (byGoogleId) return byGoogleId;

    const byEmail = await this.usersRepository.findOne({
      where: {email: profile.email},
    });
    if (byEmail) {
      byEmail.googleId = profile.googleId;
      // Backfill an avatar for an account that never set one.
      if (!byEmail.profileImageUrl && profile.picture) {
        byEmail.profileImageUrl = profile.picture;
      }
      return await this.usersRepository.save(byEmail);
    }

    // Neither an active account holds this identity. Self-deletion
    // (deactivateSelf) releases googleId/email before soft-deleting, so if a
    // *soft-deleted* row still holds either, it's an admin-removed account —
    // refuse re-registration under the same identity (a moderated user
    // shouldn't be able to dodge a ban by re-registering) with a clear message,
    // rather than letting the unique index reject the insert as a raw 409.
    const removed = await this.usersRepository.findOne({
      where: [{googleId: profile.googleId}, {email: profile.email}],
      withDeleted: true,
    });
    if (removed) {
      throw new ForbiddenException('This account has been removed');
    }

    const user = this.usersRepository.create({
      name: profile.name,
      email: profile.email,
      googleId: profile.googleId,
      password: null,
      // Google already verified the address.
      isVerified: true,
      ...(profile.picture ? {profileImageUrl: profile.picture} : {}),
    });

    try {
      return await this.usersRepository.save(user);
    } catch (error) {
      // Maps a duplicate (e.g. a googleId race) to 409 and re-throws; the
      // trailing throw is unreachable but satisfies the Promise<User> return.
      handleQueryFailedError(error, 'google sign-in');
      throw error;
    }
  }

  async findAll(page: number = 1, limit: number = 20, search?: string) {
    const {skip, take} = paginate(page, limit);

    let where: FindOptionsWhere<User>[] | undefined;
    if (search) {
      const like = Like(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
      where = [{name: like}, {email: like}];
    }

    const [users, total] = await this.usersRepository.findAndCount({
      skip,
      take,
      where,
      withDeleted: true,
      order: {createdAt: 'DESC'},
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

  // A member deleting their own account (as opposed to admin removal, see
  // `remove`). Releases the unique identifiers (email, googleId) *before*
  // soft-deleting, so the same person can register/sign-in fresh afterwards
  // instead of colliding with their old, now-inert row. The placeholder email
  // embeds the row's own id, so it can never collide with another user's;
  // `.invalid` is a reserved TLD guaranteed never to be a real address.
  // Content (stories/comments) stays attributed to the (now anonymous) row.
  async deactivateSelf(id: string) {
    const user = await this.findOne(id);

    user.googleId = null;
    user.email = `deleted-${id}@deleted.invalid`;
    await this.usersRepository.save(user);

    await this.remove(id);
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
