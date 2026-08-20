import {PartialType} from '@nestjs/mapped-types';
import {CreateSeasonalEventDto} from './create-seasonal-event.dto';

export class UpdateSeasonalEventDto extends PartialType(
  CreateSeasonalEventDto
) {}
