import {Module} from '@nestjs/common';
import {AuthService} from './auth.service';
import {AuthController} from './auth.controller';
import {PasswordResetController} from './password-reset.controller';
import {PasswordResetService} from './password-reset.service';
import {TypeOrmModule} from '@nestjs/typeorm';
import {User} from 'src/users/entities/user.entity';
import {PasswordResetToken} from './entities/password-reset-token.entity';
import {UsersModule} from 'src/users/users.module';
import {SessionModule} from 'src/session/session.module';
import {MailModule} from 'src/mail/mail.module';
import {GoogleAuthService} from './google-auth.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, PasswordResetToken]),
    UsersModule,
    SessionModule,
    MailModule,
  ],
  controllers: [AuthController, PasswordResetController],
  providers: [AuthService, GoogleAuthService, PasswordResetService],
})
export class AuthModule {}
