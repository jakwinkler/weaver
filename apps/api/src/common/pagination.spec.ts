import { paginate } from './pagination';

describe('paginate', () => {
  it('uses a stable id order when the caller does not specify sorting', async () => {
    const qb = {
      alias: 'issue',
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    await paginate(qb as never, { page: 1, perPage: 20 }, []);

    expect(qb.addOrderBy).toHaveBeenCalledWith('issue.id', 'ASC');
    expect(qb.orderBy).not.toHaveBeenCalled();
  });

  it('adds id as a deterministic tie-breaker for requested sorting', async () => {
    const qb = {
      alias: 'issue',
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    await paginate(
      qb as never,
      { page: 1, perPage: 20, sort: '-createdAt' },
      ['createdAt'],
    );

    expect(qb.orderBy).toHaveBeenCalledWith('issue.createdAt', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('issue.id', 'ASC');
  });
});
