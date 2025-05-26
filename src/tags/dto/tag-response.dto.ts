import {Exclude, Expose} from 'class-transformer';
import type {Story} from 'src/stories/entities/story.entity';

export class TagResponseDto {
  @Expose() id: string;
  @Expose() name: string;

  @Exclude() stories: Story[];

  constructor(partial: Partial<TagResponseDto>) {
    Object.assign(this, partial);
  }
}
