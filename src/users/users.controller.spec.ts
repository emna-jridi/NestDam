import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            register: jest.fn(),
            login: jest.fn(),
          },
        },

        // MOCK UserModel
        {
          provide: 'UserModel',
          useValue: {},
        },

        // MOCK MailService
        {
          provide: 'MailService',
          useValue: {},
        },

        // MOCK AvatarService
        {
          provide: 'AvatarService',
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
