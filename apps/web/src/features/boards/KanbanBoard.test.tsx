import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HotkeysContext } from '@/hooks/useHotkeys';
import { KanbanBoard } from './KanbanBoard';

const issues = [
  {
    id: 'one',
    key: 'TEST-1',
    summary: 'First card',
    statusId: 'todo',
    priority: 'medium',
    sortOrder: 0,
  },
  {
    id: 'two',
    key: 'TEST-2',
    summary: 'Second card',
    statusId: 'todo',
    priority: 'high',
    sortOrder: 1000,
  },
  {
    id: 'three',
    key: 'TEST-3',
    summary: 'Done card',
    statusId: 'done',
    priority: 'low',
    sortOrder: 0,
  },
].map((issue) => ({
  projectId: 'project-1',
  assigneeId: null,
  reporterId: 'user-1',
  customFields: {},
  labels: [],
  percentDone: 0,
  createdAt: '2026-08-27T12:00:00.000Z',
  updatedAt: '2026-08-27T12:00:00.000Z',
  ...issue,
}));

vi.mock('@/api', () => ({
  useProject: () => ({ data: { id: 'project-1', workflowId: 'workflow-1' }, isLoading: false }),
  useProjectIssues: () => ({ data: { data: issues }, isLoading: false }),
  useProjectPlugins: () => ({ data: [{ pluginId: '@weaver/plugin-board' }] }),
  useReorderIssues: () => ({ mutate: vi.fn() }),
  useUpdateIssueDynamic: () => ({ mutate: vi.fn() }),
  useWorkflow: () => ({
    data: {
      statuses: [
        { id: 'todo', name: 'To Do', color: '#6b7280', category: 'to_do' },
        { id: 'done', name: 'Done', color: '#16a34a', category: 'done' },
      ],
    },
  }),
}));

vi.mock('@/api/hooks-phase2', () => ({
  useBoards: () => ({ data: [{ id: 'board-1', name: 'Test board' }], isLoading: false }),
  useCreateBoard: () => ({ mutateAsync: vi.fn(), isError: false, isPending: false }),
}));

Object.defineProperty(Element.prototype, 'scrollIntoView', {
  configurable: true,
  value: () => undefined,
});

function LocationDisplay() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderBoard() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/projects/TEST/board']}>
        <HotkeysContext.Provider value="board">
          <LocationDisplay />
          <Routes>
            <Route path="/projects/:projectKey/board" element={<KanbanBoard />} />
            <Route path="/issues/:issueKey" element={<div>Issue fixture</div>} />
          </Routes>
        </HotkeysContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe('KanbanBoard keyboard navigation', () => {
  it('moves between cards in two dimensions and opens the active card', async () => {
    renderBoard();

    fireEvent.keyDown(document, { key: 'ArrowDown' });
    const firstCard = screen.getByText('First card').closest<HTMLElement>('[data-board-issue-id]')!;
    await waitFor(() => expect(firstCard).toHaveFocus());

    fireEvent.keyDown(firstCard, { key: 'ArrowDown' });
    const secondCard = screen
      .getByText('Second card')
      .closest<HTMLElement>('[data-board-issue-id]')!;
    await waitFor(() => expect(secondCard).toHaveFocus());

    fireEvent.keyDown(secondCard, { key: 'ArrowRight' });
    const doneCard = screen.getByText('Done card').closest<HTMLElement>('[data-board-issue-id]')!;
    await waitFor(() => expect(doneCard).toHaveFocus());
    expect(doneCard).toHaveAttribute('data-keyboard-active', 'true');

    fireEvent.keyDown(doneCard, { key: 'Enter' });
    expect(screen.getByTestId('location')).toHaveTextContent('/issues/TEST-3');
  });
});
