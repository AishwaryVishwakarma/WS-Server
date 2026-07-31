import {Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {Series} from './entities/series.entity';
import {User} from 'src/users/entities/user.entity';

@Injectable()
export class SeriesService {
  constructor(
    @InjectRepository(Series)
    private readonly seriesRepository: Repository<Series>
  ) {}

  // Resolves this author's series by title, creating one if they've never
  // used it before. The story editor's Series field is a single free-text
  // input — picking an existing name and typing a new one are the same
  // action here, so there's no separate "create a series" step to call
  // first.
  async findOrCreateForAuthor(author: User, title: string): Promise<Series> {
    const trimmed = title.trim();
    const existing = await this.seriesRepository.findOne({
      where: {author: {id: author.id}, title: trimmed},
    });
    if (existing) {
      return existing;
    }

    return this.seriesRepository.save(
      this.seriesRepository.create({author, title: trimmed})
    );
  }

  async findOne(id: string): Promise<Series> {
    return await this.seriesRepository
      .findOneOrFail({where: {id}, relations: ['author']})
      .catch(() => {
        throw new NotFoundException(`Series with ID ${id} not found`);
      });
  }

  // The author's own series, for the story editor's "you already have"
  // hints — so retyping an exact existing title (rather than a near-miss)
  // is easy to get right — and for /me's My Series list, which shows each
  // series' story count. Eager-loads `stories` (every status, matching
  // this endpoint's existing "regardless of moderation status" scope) so
  // SeriesResponseDto can compute storyCount from it.
  async findAllByAuthor(authorId: string): Promise<Series[]> {
    return this.seriesRepository.find({
      where: {author: {id: authorId}},
      relations: ['stories'],
      order: {title: 'ASC'},
    });
  }
}
