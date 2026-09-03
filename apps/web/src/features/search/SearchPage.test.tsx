// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchPage } from './SearchPage';

const searchState = {
  data: {
    data: [
      {
        key: 'SEC-1',
        summary: 'Review access controls',
        priority: 'high',
        status: 'To Do',
      },
    ],
    total: 1,
    page: 1,
    perPage: 50,
  },
  isPending: false,
  isError: false,
  mutate: vi.fn(),
};

vi.mock('@/api/hooks-phase3', () => ({
  useSearch: () => searchState,
  useSavedFilters: () => ({ data: [], isLoading: false }),
  useCreateSavedFilter: () => ({
    isPending: false,
    isError: false,
    mutateAsync: vi.fn(),
  }),
  useDeleteSavedFilter: () => ({ mutateAsync: vi.fn() }),
}));

describe('SearchPage', () => {
  afterEach(cleanup);

  it('renders the pagination shape returned by the search API', () => {
    render(<SearchPage />);

    expect(screen.getByText('1 result found')).toBeTruthy();
    expect(screen.getByText('Review access controls')).toBeTruthy();
  });
});
