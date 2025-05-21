import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  HttpCode,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import {UsersService} from './users.service';
import {CreateUserDto} from './dto/create-user.dto';
import {UpdateUserDto} from './dto/update-user.dto';
import {SessionAuthGuard} from 'src/common/gaurds/session-auth.gaurd';
import {PaginationDto} from 'src/common/dto/pagination.dto';
import {User} from './entities/user.entity';
import type {Request} from 'express';
import {serializeUser} from 'src/utils/serialization';

@UseGuards(SessionAuthGuard)
@Controller('users')
export class UsersController {
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

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = await this.usersService.findOne(id);
    return this._serialize(user, req.session.isAdmin);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: Request
  ) {
    const user = await this.usersService.update(id, updateUserDto);
    return this._serialize(user as User, req.session.isAdmin);
  }

  @Patch(':id/restore')
  @HttpCode(204)
  async restore(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.restore(id);
  }

  @Delete('me')
  @HttpCode(204)
  async removeMe(@Req() req: Request) {
    return this.usersService.removeMe(req);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.remove(id);
  }
}
