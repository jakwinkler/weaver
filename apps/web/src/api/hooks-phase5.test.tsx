// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './client';
import { useSearchUsers } from './hooks-phase5';

vi.mock('./client', () => ({
  apiClient: { get: vi.fn() },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useSearchUsers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('waits 300ms after the query changes before searching', async () => {
    const { rerender } = renderHook(({ query }) => useSearchUsers(query), {
      initialProps: { query: 'a' },
      wrapper: createWrapper(),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    rerender({ query: 'ali' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(apiClient.get).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(apiClient.get).toHaveBeenCalledTimes(1);
    expect(apiClient.get).toHaveBeenCalledWith('/users/search', {
      params: { q: 'ali' },
    });
  });

  it('loads the first tenant members when the user types a bare @', async () => {
    renderHook(() => useSearchUsers(''), { wrapper: createWrapper() });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(apiClient.get).toHaveBeenCalledWith('/users/search', {
      params: { q: '' },
    });
  });
});
