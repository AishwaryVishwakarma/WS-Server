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
import {serializeUser} from 'src/utils/serialization';
import {AdminOnlyGuard} from 'src/common/gaurds/admin-only.gaurd';
import {UsersService} from '../users.service';
import {User} from '../entities/user.entity';
import {CreateUserDto} from '../dto/create-user.dto';
import {UpdateUserDto} from '../dto/update-user.dto';

@UseGuards(SessionAuthGuard, AdminOnlyGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  private _serialize(user: User, isAdmin: boolean = false) {
    return serializeUser(user, isAdmin);
  }

  @Post()
  @HttpCode(201)
  async create(@Body() createUserDto: CreateUserDto, @Req() req: Request) {
    const user = await this.usersService.create(createUserDto);
    return this._serialize(user as User, req.session.isAdmin);
  }

  @Get()
  async findAll(@Query() paginationDto: PaginationDto, @Req() req: Request) {
    const result = await this.usersService.findAll(
      paginationDto.page,
      paginationDto.limit
    );

    return {
      ...result,
      data: result.data.map((user) =>
        this._serialize(user, req.session.isAdmin)
      ),
    };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: Request
  ) {
    const user = await this.usersService.update(id, updateUserDto, req);
    return this._serialize(user as User, req.session.isAdmin);
  }

  @Patch(':id/restore')
  @HttpCode(204)
  async restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.restore(id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.remove(id);
  }
}
