import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { it, expect, vi } from 'vitest';
import { PublicProjectPage } from './PublicProjectPage';
const { board, issues } = vi.hoisted(() => ({ board: vi.fn(), issues: vi.fn() }));
vi.mock('@/api/hooks-public', () => ({
  usePublicProject: () => ({ data: { key: 'PUB', name: 'Public project', description: '' } }),
  usePublicProjectIssues: (...args: unknown[]) => issues(...args),
  usePublicProjectBoard: (...args: unknown[]) => board(...args),
}));
it('lets a visitor reach the next board page and makes partial counts explicit', () => {
  const meta = { page: 1, perPage: 25, total: 30, totalPages: 2 };
  issues.mockReturnValue({ data: { data: [], meta } });
  board.mockImplementation((_tenant, _project, page = 1) => ({
    data: {
      issues: [
        {
          id: 'i',
          key: 'PUB-1',
          summary: page === 1 ? 'First page' : 'Second page',
          statusId: 's',
        },
      ],
      statuses: [{ id: 's', name: 'Open', color: '#fff' }],
      meta: { ...meta, page },
    },
  }));
  render(
    <MemoryRouter initialEntries={['/public/team/projects/PUB']}>
      <Routes>
        <Route path="/public/:tenantSlug/projects/:projectKey" element={<PublicProjectPage />} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'board' }));
  expect(screen.getByText(/counts.*this page/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /next/i }));
  expect(screen.getByText('Second page')).toBeTruthy();
  expect(board).toHaveBeenLastCalledWith('team', 'PUB', 2, 25);
});
