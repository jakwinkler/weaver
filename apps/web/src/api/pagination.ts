import type { PaginatedResponse } from '@weaver/shared';
import { apiClient } from './client';

export async function fetchAllPages<T>(
  url: string,
  params: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<T>> {
  const data: T[] = [];
  for (let page = 1; page <= 10000; page += 1) {
    const response = (
      await apiClient.get<PaginatedResponse<T>>(url, {
        params: { ...params, page, perPage: 100 },
        signal,
      })
    ).data;
    if (
      !Array.isArray(response.data) ||
      !response.meta ||
      !Number.isFinite(response.meta.totalPages)
    ) {
      throw new Error('Invalid paginated response');
    }
    data.push(...response.data);
    if (page >= response.meta.totalPages) {
      return {
        data,
        meta: { ...response.meta, page: 1, perPage: data.length, totalPages: data.length ? 1 : 0 },
      };
    }
    if (!response.data.length) throw new Error('Incomplete paginated response');
  }
  throw new Error('Too many pages; narrow the query');
}
