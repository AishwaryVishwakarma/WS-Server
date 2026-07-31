import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {StoriesModule} from 'src/stories/stories.module';
import {ScareVote} from './entities/scare-vote.entity';
import {ScareRatingsService} from './scare-ratings.service';
import {ScareRatingsController} from './scare-ratings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ScareVote]), StoriesModule],
  controllers: [ScareRatingsController],
  providers: [ScareRatingsService],
  exports: [ScareRatingsService],
})
export class ScareRatingsModule {}
