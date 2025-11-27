import { Test, TestingModule } from '@nestjs/testing';
import { ScanController } from './scan.controller';
import { ScanService } from './scan.service';

describe('ScanController', () => {
  let controller: ScanController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScanController],
      providers: [
        {
          provide: ScanService,
          useValue: {
            analyzeInstalledApps: jest.fn(),
            analyzeIosApps: jest.fn(),
          },
        },

        // Mock AppRegistryService
        {
          provide: 'AppRegistryService',
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<ScanController>(ScanController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
