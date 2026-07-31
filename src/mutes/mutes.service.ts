import {BadRequestException, Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {getPaginatedResponse, paginate} from 'src/utils/pagination';
import {UsersService} from 'src/users/users.service';
import {MutedAuthor} from './entities/muted-author.entity';

@Injectable()
export class MutesService {
  constructor(
    @InjectRepository(MutedAuthor)
    private readonly mutedAuthorRepository: Repository<MutedAuthor>,
    private readonly usersService: UsersService
  ) {}

  // Mute an author. Validates the target exists (findOne 404s otherwise) and
  // rejects self-mutes; the unique (user, mutedAuthor) constraint makes a
  // repeat mute a no-op, so the endpoint is idempotent. No notification —
  // muting is deliberately silent.
  async mute(userId: string, targetId: string): Promise<void> {
    if (userId === targetId) {
      throw new BadRequestException('You cannot mute yourself');
    }
    await this.usersService.findOne(targetId);

    const exists = await this.mutedAuthorRepository.existsBy({
      user: {id: userId},
      mutedAuthor: {id: targetId},
    });
    if (exists) return;

    await this.mutedAuthorRepository.save(
      this.mutedAuthorRepository.create({
        user: {id: userId},
        mutedAuthor: {id: targetId},
      })
    );
  }

  // Unmute. A no-op (still 204) when not muted, so the toggle is safe from a
  // stale client.
  async unmute(userId: string, targetId: string): Promise<void> {
    await this.mutedAuthorRepository.delete({
      user: {id: userId},
      mutedAuthor: {id: targetId},
    });
  }

  // The author ids a member has muted — fetched once so the client can show
  // mute state on a profile without a per-view join, and other feeds can
  // exclude them.
  async mutedAuthorIds(userId: string): Promise<string[]> {
    const rows = await this.mutedAuthorRepository
      .createQueryBuilder('mute')
      .select('mute.mutedAuthorId', 'mutedAuthorId')
      .where('mute.user = :userId', {userId})
      .getRawMany<{mutedAuthorId: string}>();

    return rows.map((row) => row.mutedAuthorId);
  }

  // The authors this member has muted (most-recent first). Self-only — for
  // /me's management list, the undo path for a mute made from a profile.
  async findMuted(userId: string, page = 1, limit = 20) {
    const {skip, take} = paginate(page, limit);
    const [rows, total] = await this.mutedAuthorRepository
      .createQueryBuilder('mute')
      .innerJoinAndSelect('mute.mutedAuthor', 'user')
      .where('mute.user = :userId', {userId})
      .orderBy('mute.createdAt', 'DESC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return getPaginatedResponse(
      rows.map((row) => row.mutedAuthor),
      total,
      page,
      limit
    );
  }
}
