import {Module} from '@nestjs/common';
import {UsersService} from './users.service';
import {TypeOrmModule} from '@nestjs/typeorm';
import {User} from './entities/user.entity';
import {SessionModule} from 'src/session/session.module';
import {PublicUsersController} from './controllers/public-users.controller';
import {AdminUsersController} from './controllers/admin.users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User]), SessionModule],
  controllers: [PublicUsersController, AdminUsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
