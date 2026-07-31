import {forwardRef, Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {UsersModule} from 'src/users/users.module';
import {MutedAuthor} from './entities/muted-author.entity';
import {MutesService} from './mutes.service';
import {MutesController} from './mutes.controller';

// Depends only on UsersModule (no StoriesModule/FollowsModule) — this keeps
// the module graph acyclic in the direction StoriesModule/FollowsModule both
// import MutesModule below, as a real service dependency rather than a
// raw-repository workaround. UsersModule itself still needs forwardRef here
// (mirroring CommentsModule/SeriesModule): UsersModule -> StoriesModule ->
// MutesModule -> UsersModule is a genuine circular *file* import, not just a
// container-level one — a direct import would resolve to undefined mid-load.
@Module({
  imports: [
    TypeOrmModule.forFeature([MutedAuthor]),
    forwardRef(() => UsersModule),
  ],
  controllers: [MutesController],
  providers: [MutesService],
  exports: [MutesService],
})
export class MutesModule {}
