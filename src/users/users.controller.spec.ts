import {Test, TestingModule} from '@nestjs/testing';
import {UsersService} from './users.service';
import {PublicUsersController} from './controllers/public-users.controller';

describe('UsersController', () => {
  let controller: PublicUsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicUsersController],
      providers: [UsersService],
    }).compile();

    controller = module.get<PublicUsersController>(PublicUsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
