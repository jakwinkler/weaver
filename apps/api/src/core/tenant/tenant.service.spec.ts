import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TenantEntity } from '@weaver/db';
import { TenantService } from './tenant.service';

describe('TenantService', () => {
  let service: TenantService;
  const mockRepo = {
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        {
          provide: getRepositoryToken(TenantEntity),
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<TenantService>(TenantService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should find tenant by id', async () => {
    const tenant = { id: '1', name: 'Test' };
    mockRepo.findOneBy.mockResolvedValue(tenant);

    const result = await service.findById('1');
    expect(result).toEqual(tenant);
    expect(mockRepo.findOneBy).toHaveBeenCalledWith({ id: '1' });
  });

  it('should find tenant by slug', async () => {
    const tenant = { id: '1', slug: 'test-org' };
    mockRepo.findOneBy.mockResolvedValue(tenant);

    const result = await service.findBySlug('test-org');
    expect(result).toEqual(tenant);
    expect(mockRepo.findOneBy).toHaveBeenCalledWith({ slug: 'test-org' });
  });

  it('should create tenant with derived schema name', async () => {
    const input = { name: 'Test Org', slug: 'test-org' };
    const created = {
      ...input,
      schemaName: 'tenant_test_org',
      plan: 'free',
      settings: {},
    };
    mockRepo.create.mockReturnValue(created);
    mockRepo.save.mockResolvedValue({ id: '1', ...created });

    const result = await service.create(input);

    expect(mockRepo.create).toHaveBeenCalledWith({
      name: 'Test Org',
      slug: 'test-org',
      schemaName: 'tenant_test_org',
      plan: 'free',
      settings: {},
    });
    expect(result.id).toBe('1');
  });

  it('should convert hyphens to underscores in schema name', async () => {
    const input = { name: 'My Cool Org', slug: 'my-cool-org' };
    const created = {
      ...input,
      schemaName: 'tenant_my_cool_org',
      plan: 'free',
      settings: {},
    };
    mockRepo.create.mockReturnValue(created);
    mockRepo.save.mockResolvedValue({ id: '2', ...created });

    await service.create(input);

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ schemaName: 'tenant_my_cool_org' }),
    );
  });
});
