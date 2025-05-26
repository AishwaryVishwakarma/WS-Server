import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {PaginationDto} from 'src/common/dto/pagination.dto';
import type {Request} from 'express';
import {AdminOnlyGuard} from 'src/common/gaurds/admin-only.gaurd';
import {UsersService} from '../users.service';
import {User} from '../entities/user.entity';
import {CreateUserDto} from '../dto/create-user.dto';
import {UpdateUserDto} from '../dto/update-user.dto';
import {plainToInstance} from 'class-transformer';
import {UserResponseDto} from '../dto/user-response.dto';
import {SessionService} from 'src/session/session.service';

@UseGuards(SessionAuthGuard, AdminOnlyGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly sessionService: SessionService
  ) {}

  private _serialize(user: User) {
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  @Post()
  @HttpCode(201)
  async create(@Body() createUserDto: CreateUserDto) {
    const user = await this.usersService.create(createUserDto);
    return this._serialize(user as User);
  }

  @Get('me')
  async findMe(@Req() req: Request) {
    const user = await this.usersService.findMe(req.session.userId!);
    return this._serialize(user);
  }

  @Get()
  async findAll(@Query() paginationDto: PaginationDto) {
    const result = await this.usersService.findAll(
      paginationDto.page,
      paginationDto.limit
    );

    return {
      ...result,
      data: result.data.map((user) => this._serialize(user)),
    };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: Request
  ) {
    const user = await this.usersService.update(
      id,
      updateUserDto,
      req.session.userId!,
      req.session.isAdmin!
    );
    return this._serialize(user as User);
  }

  @Patch(':id/restore')
  @HttpCode(204)
  async restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.restore(id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.usersService.remove(id);

    if (req.session.userId === id) {
      return await this.sessionService.destroy(req);
    }
  }
}
