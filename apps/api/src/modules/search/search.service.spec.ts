import { SearchService } from './search.service';

describe('SearchService', () => {
  it('returns the shared paginated response shape', async () => {
    const issues = [{ id: 'issue-2' }];
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([issues, 2]),
    };
    const entityManager = {
      getRepository: jest.fn().mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      }),
    };
    const tenantConnections = {
      getEntityManager: jest.fn().mockResolvedValue(entityManager),
    };
    const service = new SearchService(tenantConnections as any);

    const result = await service.search({
      query: 'priority = "medium"',
      page: 2,
      perPage: 1,
    });

    expect(result).toEqual({
      data: issues,
      meta: {
        page: 2,
        perPage: 1,
        total: 2,
        totalPages: 2,
      },
    });
  });
});
