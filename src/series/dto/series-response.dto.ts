import {Expose, Type} from 'class-transformer';
import {StoryAuthorResponseDto} from 'src/stories/dto/story-response.dto';

// [public] — a series' own metadata (GET /series/:id, GET /users/me/series).
// The ordered story list rides alongside this in the controller response,
// not on this DTO — it's composed from StoriesService, not the entity's own
// `stories` relation (which isn't loaded here).
export class SeriesResponseDto {
  @Expose() id: string;
  @Expose() title: string;

  @Expose()
  @Type(() => StoryAuthorResponseDto)
  author: StoryAuthorResponseDto;

  constructor(partial: Partial<SeriesResponseDto>) {
    Object.assign(this, partial);
  }
}
