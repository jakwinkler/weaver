import { SprintsService } from './sprints.service';

describe('bounded sprint reports', () => {
  const service = new SprintsService({} as any, {} as any);
  it.each([
    ['2020-01-01', '2026-01-01'],
    ['invalid', '2026-01-01'],
    ['2026-02-30', '2026-03-10'],
  ])('rejects invalid range %s to %s', (start, end) => {
    expect(() => (service as any).getDateRange(start, end)).toThrow();
  });
  it('includes each day of a normal sprint', () => {
    expect((service as any).getDateRange('2026-09-01', '2026-09-03')).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ]);
  });
});
