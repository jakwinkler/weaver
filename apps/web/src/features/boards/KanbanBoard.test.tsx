// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Board, BoardIssuesResponse, Issue } from '@weaver/shared';
import { KanbanBoard } from './KanbanBoard';

const statusId = '550e8400-e29b-41d4-a716-446655440000';

function issue(id: string, priority: Issue['priority']): Issue {
  return {
    id,
    projectId: 'project-1',
    key: `WEB-${id}`,
    summary: `${priority} priority work`,
    statusId,
    priority,
    reporterId: 'user-1',
    customFields: {},
    labels: [],
    sortOrder: Number(id) * 1000,
    percentDone: 0,
    recurrenceRule: null,
    recurrenceParentId: null,
    recurrenceOccurrence: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

const highIssue = issue('1', 'high');
const lowIssue = issue('2', 'low');
const board: Board = {
  id: 'board-1',
  projectId: 'project-1',
  name: 'Delivery Board',
  type: 'kanban',
  config: { swimlaneField: 'priority', wipLimits: { [statusId]: 1 } },
  createdAt: new Date('2026-01-01T00:00:00Z'),
};
const boardIssues: BoardIssuesResponse = {
  board,
  issues: [highIssue, lowIssue],
  columnPointTotals: { [statusId]: 0 },
  groups: [
    { key: 'priority:high', value: 'high', label: 'High', issues: [highIssue] },
    { key: 'priority:low', value: 'low', label: 'Low', issues: [lowIssue] },
  ],
};

vi.mock('react-router-dom', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
  useNavigate: () => vi.fn(),
  useParams: () => ({ projectKey: 'WEB' }),
}));

vi.mock('@/api', () => ({
  useProject: () => ({ data: { id: 'project-1', key: 'WEB', workflowId: 'workflow-1' } }),
  useProjectIssues: () => ({ data: { data: boardIssues.issues }, isLoading: false }),
  useWorkflow: () => ({
    data: {
      statuses: [{ id: statusId, name: 'To Do', color: '#6b7280', category: 'todo', position: 0 }],
    },
  }),
  useProjectPlugins: () => ({
    data: [{ pluginId: '@weaver/plugin-board' }],
  }),
  useUpdateIssueDynamic: () => ({ mutateAsync: vi.fn() }),
  useReorderIssues: () => ({ mutateAsync: vi.fn() }),
  useHasPermission: () => true,
}));

vi.mock('@/api/hooks-phase2', () => ({
  useBoards: () => ({ data: [board], isLoading: false, refetch: vi.fn() }),
  useBoardIssues: () => ({ data: boardIssues, isLoading: false }),
  useCreateBoard: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useUpdateBoard: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
}));

afterEach(cleanup);

describe('KanbanBoard swimlanes and WIP limits', () => {
  it('renders collapsible swimlanes and highlights a full status column', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <KanbanBoard />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('combobox', { name: 'Group by' }).textContent).toContain('Priority');
    expect(screen.getAllByText('2/1')).toHaveLength(2);
    expect(
      screen
        .getAllByTestId('kanban-column')
        .every((column) => column.getAttribute('data-wip-reached') === 'true'),
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Collapse High swimlane' }));

    expect(screen.queryByText('high priority work')).toBeNull();
    expect(screen.getByText('low priority work')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Expand High swimlane' })).not.toBeNull();
  });
});
