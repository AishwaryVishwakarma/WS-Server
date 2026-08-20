import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {TagsService} from 'src/tags/tags.service';
import {SeasonalEvent} from './entities/seasonal-event.entity';
import {SeasonalEventCompletion} from './entities/seasonal-event-completion.entity';
import {ReadingProgress} from 'src/reading-progress/entities/reading-progress.entity';
import {StoryStatus} from 'src/stories/enums/story-status.enum';
import {CreateSeasonalEventDto} from './dto/create-seasonal-event.dto';
import {UpdateSeasonalEventDto} from './dto/update-seasonal-event.dto';

export type SeasonalEventStatus = 'draft' | 'scheduled' | 'active' | 'ended';

@Injectable()
export class SeasonalEventsService {
  constructor(
    @InjectRepository(SeasonalEvent)
    private readonly eventsRepository: Repository<SeasonalEvent>,
    @InjectRepository(SeasonalEventCompletion)
    private readonly completionsRepository: Repository<SeasonalEventCompletion>,
    @InjectRepository(ReadingProgress)
    private readonly progressRepository: Repository<ReadingProgress>,
    private readonly tagsService: TagsService
  ) {}

  status(event: SeasonalEvent, now = new Date()): SeasonalEventStatus {
    if (!event.isPublished) return 'draft';
    if (now < event.startsAt) return 'scheduled';
    if (now >= event.endsAt) return 'ended';
    return 'active';
  }

  view(event: SeasonalEvent) {
    return {
      ...event,
      status: this.status(event),
      tagSlugs: event.tags.map((tag) => tag.slug),
    };
  }

  async list() {
    const events = await this.eventsRepository.find({
      order: {startsAt: 'DESC'},
    });
    return events.map((event) => this.view(event));
  }

  async publicList() {
    const events = await this.eventsRepository.find({
      where: {isPublished: true},
      order: {startsAt: 'DESC'},
    });
    return events.map((event) => this.view(event));
  }

  async active(now = new Date()) {
    return this.eventsRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.tags', 'tag')
      .where('event.isPublished = true')
      .andWhere('event.startsAt <= :now', {now})
      .andWhere('event.endsAt > :now', {now})
      .orderBy('event.startsAt', 'DESC')
      .getOne();
  }

  async create(dto: CreateSeasonalEventDto) {
    const event = this.eventsRepository.create();
    await this.assign(event, dto);
    return this.view(await this.eventsRepository.save(event));
  }

  async update(id: string, dto: UpdateSeasonalEventDto) {
    const event = await this.findOne(id);
    await this.assign(event, dto);
    return this.view(await this.eventsRepository.save(event));
  }

  async remove(id: string) {
    const result = await this.eventsRepository.delete(id);
    if (!result.affected) throw new NotFoundException('Event not found');
  }

  async analytics(id: string) {
    const event = await this.findOne(id);
    const tagIds = event.tags.map((tag) => tag.id);
    const completions = await this.completionsRepository.count({
      where: {event: {id}},
    });

    if (tagIds.length === 0) {
      return {participants: 0, completions, completionRate: 0, stories: []};
    }

    const base = this.progressRepository
      .createQueryBuilder('progress')
      .innerJoin('progress.story', 'story')
      .innerJoin('story.tags', 'tag')
      .where('progress.percent >= :completePercent', {completePercent: 95})
      .andWhere('progress.updatedAt >= :startsAt', {startsAt: event.startsAt})
      .andWhere('progress.updatedAt < :endsAt', {endsAt: event.endsAt})
      .andWhere('story.status = :status', {status: StoryStatus.Approved})
      .andWhere('tag.id IN (:...tagIds)', {tagIds});

    const participantResult = await base
      .clone()
      .select('COUNT(DISTINCT progress.userId)', 'count')
      .getRawOne<{count: string}>();
    const participants = Number(participantResult?.count) || 0;
    const stories = await base
      .clone()
      .select('story.id', 'id')
      .addSelect('story.title', 'title')
      .addSelect('story.slug', 'slug')
      .addSelect('COUNT(DISTINCT progress.userId)', 'readers')
      .groupBy('story.id')
      .addGroupBy('story.title')
      .addGroupBy('story.slug')
      .orderBy('COUNT(DISTINCT progress.userId)', 'DESC')
      .addOrderBy('story.title', 'ASC')
      .limit(5)
      .getRawMany<{id: string; title: string; slug: string; readers: string}>();

    return {
      participants,
      completions,
      completionRate: participants
        ? Math.min(100, Math.round((completions / participants) * 100))
        : 0,
      stories: stories.map((story) => ({
        ...story,
        readers: Number(story.readers),
      })),
    };
  }

  private async findOne(id: string) {
    const event = await this.eventsRepository.findOne({where: {id}});
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  private async assign(
    event: SeasonalEvent,
    dto: CreateSeasonalEventDto | UpdateSeasonalEventDto
  ) {
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : event.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : event.endsAt;
    if (!startsAt || !endsAt || startsAt >= endsAt) {
      throw new BadRequestException('End time must be after start time');
    }

    const tagIds = dto.tagIds ?? event.tags?.map((tag) => tag.id) ?? [];
    const tags = await this.tagsService.findManyByIds(tagIds);
    if (tags.length !== new Set(tagIds).size) {
      throw new BadRequestException('Every selected tag must exist');
    }

    const isPublished = dto.isPublished ?? event.isPublished ?? false;
    if (isPublished) await this.assertNoOverlap(event.id, startsAt, endsAt);

    Object.assign(event, dto, {
      startsAt,
      endsAt,
      isPublished,
      tags,
    });
  }

  private async assertNoOverlap(
    id: string | undefined,
    startsAt: Date,
    endsAt: Date
  ) {
    const where = id ? 'event.id != :id' : 'TRUE';
    const overlap = await this.eventsRepository
      .createQueryBuilder('event')
      .where('event.isPublished = true')
      .andWhere(where, {id})
      .andWhere('event.startsAt < :endsAt', {endsAt})
      .andWhere('event.endsAt > :startsAt', {startsAt})
      .getExists();
    if (overlap) {
      throw new ConflictException('Published event windows cannot overlap');
    }
  }
}
