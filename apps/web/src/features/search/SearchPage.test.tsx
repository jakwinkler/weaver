import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchPage } from './SearchPage';

const searchMutate = vi.fn();
const storedValues = new Map<string, string>();

vi.stubGlobal('localStorage', {
  clear: () => storedValues.clear(),
  getItem: (key: string) => storedValues.get(key) ?? null,
  removeItem: (key: string) => storedValues.delete(key),
  setItem: (key: string, value: string) => storedValues.set(key, value),
});

vi.mock('@/api/hooks-phase3', () => ({
  useSearch: () => ({
    data: {
      data: Array.from({ length: 10 }, (_, index) => ({
        key: `SRC-${index + 11}`,
        summary: `Search result ${index + 11}`,
        priority: 'medium',
        status: 'To Do',
      })),
      meta: {
        page: 2,
        perPage: 10,
        total: 21,
        totalPages: 3,
      },
    },
    isPending: false,
    isError: false,
    mutate: searchMutate,
  }),
  useSavedFilters: () => ({ data: [], isLoading: false }),
  useCreateSavedFilter: () => ({ isPending: false, isError: false, mutateAsync: vi.fn() }),
  useDeleteSavedFilter: () => ({ mutateAsync: vi.fn() }),
}));

afterEach(cleanup);

describe('SearchPage pagination', () => {
  beforeEach(() => {
    searchMutate.mockClear();
    localStorage.clear();
  });

  it('restores the search from the URL and requests another result page', async () => {
    render(
      <MemoryRouter initialEntries={['/search?q=priority%20%3D%20%22medium%22&page=2&perPage=10']}>
        <Routes>
          <Route path="/search" element={<SearchPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(searchMutate).toHaveBeenCalledWith({
        query: 'priority = "medium"',
        page: 2,
        perPage: 10,
      });
    });
    expect(screen.getByText('Showing 11-20 of 21')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '3' }));

    await waitFor(() => {
      expect(searchMutate).toHaveBeenLastCalledWith({
        query: 'priority = "medium"',
        page: 3,
        perPage: 10,
      });
    });
  });
});

describe('SearchPage results', () => {
  beforeEach(() => {
    searchMutate.mockClear();
    localStorage.clear();
  });

  it('links each result key and summary to the issue', () => {
    render(
      <MemoryRouter initialEntries={['/search?q=priority%20%3D%20%22medium%22&page=2&perPage=10']}>
        <Routes>
          <Route path="/search" element={<SearchPage />} />
          <Route path="/issues/:issueKey" element={<p>Issue detail route</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'SRC-11' })).toHaveAttribute('href', '/issues/SRC-11');
    expect(screen.getByRole('link', { name: 'Search result 11' })).toHaveAttribute(
      'href',
      '/issues/SRC-11',
    );

    fireEvent.click(screen.getByRole('link', { name: 'Search result 12' }));
    expect(screen.getByText('Issue detail route')).toBeInTheDocument();
  });
});
