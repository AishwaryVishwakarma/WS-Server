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
import {CreateSeasonalEventDto} from './dto/create-seasonal-event.dto';
import {UpdateSeasonalEventDto} from './dto/update-seasonal-event.dto';

export type SeasonalEventStatus = 'draft' | 'scheduled' | 'active' | 'ended';

@Injectable()
export class SeasonalEventsService {
  constructor(
    @InjectRepository(SeasonalEvent)
    private readonly eventsRepository: Repository<SeasonalEvent>,
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
