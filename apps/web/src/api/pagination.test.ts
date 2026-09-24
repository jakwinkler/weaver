import { expect, it, vi } from 'vitest';
vi.mock('./client', () => ({ apiClient: { get: vi.fn() } }));
import { apiClient } from './client';
import { fetchAllPages } from './pagination';
it('reads every page, even when the server caps requested page size', async () => {
  vi.mocked(apiClient.get).mockImplementation(async (_url, config) => {
    const page = Number((config?.params as { page?: number })?.page ?? 1);
    return { data: { data: [page], meta: { page, perPage: 1, total: 3, totalPages: 3 } } };
  });
  expect((await fetchAllPages('/issues')).data).toEqual([1, 2, 3]);
});
