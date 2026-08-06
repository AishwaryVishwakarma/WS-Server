import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {PresenceService} from './presence.service';
import {PresenceController} from './presence.controller';
import {Story} from 'src/stories/entities/story.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Story])],
  controllers: [PresenceController],
  providers: [PresenceService],
})
export class PresenceModule {}
