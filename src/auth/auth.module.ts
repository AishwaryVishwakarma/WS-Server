import {Module} from '@nestjs/common';
import {AuthService} from './auth.service';
import {AuthController} from './auth.controller';
import {TypeOrmModule} from '@nestjs/typeorm';
import {User} from 'src/users/entities/user.entity';
import {UsersModule} from 'src/users/users.module';
import {SessionModule} from 'src/session/session.module';
import {GoogleAuthService} from './google-auth.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), UsersModule, SessionModule],
  controllers: [AuthController],
  providers: [AuthService, GoogleAuthService],
})
export class AuthModule {}
