import {Expose, Transform, Type} from 'class-transformer';
import {StoryAuthorResponseDto} from 'src/stories/dto/story-response.dto';
import type {Series} from '../entities/series.entity';

// [public] — a series' own metadata (GET /series/:id, GET /users/me/series).
// The ordered story list rides alongside this in the controller response,
// not on this DTO — it's composed from StoriesService, not the entity's own
// `stories` relation (which isn't loaded here).
export class SeriesResponseDto {
  @Expose() id: string;
  @Expose() title: string;
  @Expose() slug: string;

  @Expose()
  @Type(() => StoryAuthorResponseDto)
  author: StoryAuthorResponseDto;

  // Populated only where the query eager-loads the `stories` relation
  // (SeriesService.findAllByAuthor, backing GET /users/me/series) —
  // undefined (so absent from the response) everywhere else, the same
  // "populated only when loaded here" convention as story.author/.series.
  @Expose()
  @Transform(({obj}: {obj: Series}) => obj.stories?.length)
  storyCount?: number;

  constructor(partial: Partial<SeriesResponseDto>) {
    Object.assign(this, partial);
  }
}
