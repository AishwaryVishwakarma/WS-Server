import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import type {Request} from 'express';
import {serializeUser} from 'src/utils/serialization';
import {UsersService} from '../users.service';
import {User} from '../entities/user.entity';
import {UpdateUserDto} from '../dto/update-user.dto';

@UseGuards(SessionAuthGuard)
@Controller('users')
export class PublicUsersController {
  constructor(private readonly usersService: UsersService) {}

  private _serialize(user: User) {
    return serializeUser(user);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.usersService.findOne(id);
    return this._serialize(user);
  }

  @Patch('me')
  async updateMe(@Body() updateUserDto: UpdateUserDto, @Req() req: Request) {
    const user = await this.usersService.updateMe(updateUserDto, req);
    return this._serialize(user as User);
  }

  @Delete('me')
  @HttpCode(204)
  async removeMe(@Req() req: Request) {
    return this.usersService.removeMe(req);
  }
}
