import { SearchService } from './search.service';

describe('bounded WQL', () => {
  const service = new SearchService({} as any, {} as any);
  it('rejects excessive conditions before database work', () => {
    expect(() => (service as any).parseWql(Array(51).fill('status = "Open"').join(' OR '))).toThrow(
      '50',
    );
  });
  it('resolves repeated status conditions with one query', async () => {
    const repo = {
      find: jest.fn().mockResolvedValue([{ id: 'open-id', name: 'Open' }]),
      findOneBy: jest.fn().mockResolvedValue({ id: 'open-id' }),
    };
    const em = { getRepository: () => repo };
    const parsed = (service as any).parseWql('status = "Open" OR status = "Open"');
    const result = await (service as any).buildWhereClause(parsed, em);
    expect(result.parameters).toEqual({ p0: 'open-id', p1: 'open-id' });
    expect(repo.find).toHaveBeenCalledTimes(1);
    expect(repo.findOneBy).not.toHaveBeenCalled();
  });
});
