import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IssueListPage } from './IssueListPage';

const apiMocks = vi.hoisted(() => ({
  canEdit: true,
  mutateAsync: vi.fn(),
  transitionMutateAsync: vi.fn(),
  issuePage: {
    data: [
      {
        id: 'issue-1',
        projectId: 'project-1',
        key: 'TEST-1',
        summary: 'First issue',
        statusId: 'status-open',
        priority: 'medium',
        assigneeId: 'user-1',
        reporterId: 'user-1',
        customFields: {},
        labels: [],
        sortOrder: 0,
        dueDate: '2026-08-30',
        percentDone: 0,
        createdAt: '2026-08-26T12:00:00.000Z',
        updatedAt: '2026-08-26T12:00:00.000Z',
      },
    ],
    meta: { page: 1, perPage: 25, total: 1, totalPages: 1 },
  },
}));

vi.mock('@/api', async () => {
  const { useQuery } = await import('@tanstack/react-query');

  return {
    useCreateIssue: () => ({
      isError: false,
      isPending: false,
      mutateAsync: vi.fn(),
    }),
    useHasPermission: (permission: string) =>
      permission === 'issues.create' ||
      (['issues.update', 'issues.transition'].includes(permission) && apiMocks.canEdit),
    useIssueTypes: () => ({ data: [] }),
    useProject: () => ({
      data: { id: 'project-1', key: 'TEST', name: 'Test Project', workflowId: 'workflow-1' },
    }),
    useProjectIssues: ({ projectKey }: { projectKey: string }) =>
      useQuery({
        queryKey: ['issues', projectKey, { page: 1 }],
        queryFn: async () => apiMocks.issuePage,
        initialData: apiMocks.issuePage,
      }),
    useUpdateIssueDynamic: () => ({ mutateAsync: apiMocks.mutateAsync }),
    useTransitionIssueDynamic: () => ({ mutateAsync: apiMocks.transitionMutateAsync }),
    useUsers: () => ({
      data: [
        {
          id: 'user-1',
          displayName: 'Matt',
          email: 'matt@example.com',
        },
      ],
    }),
    useWorkflow: () => ({
      data: {
        statuses: [
          { id: 'status-open', name: 'Open', color: '#2563eb' },
          { id: 'status-done', name: 'Done', color: '#16a34a' },
        ],
        transitions: [
          { id: 'transition-done', fromStatusId: 'status-open', toStatusId: 'status-done' },
        ],
      },
    }),
  };
});

Object.defineProperty(Element.prototype, 'hasPointerCapture', {
  configurable: true,
  value: () => false,
});
Object.defineProperty(Element.prototype, 'setPointerCapture', {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(Element.prototype, 'releasePointerCapture', {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(Element.prototype, 'scrollIntoView', {
  configurable: true,
  value: () => undefined,
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/projects/TEST/issues']}>
        <Routes>
          <Route path="/projects/:projectKey/issues" element={<IssueListPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { ...result, queryClient };
}

describe('IssueListPage inline editing', () => {
  beforeEach(() => {
    apiMocks.canEdit = true;
    apiMocks.mutateAsync.mockReset();
    apiMocks.mutateAsync.mockResolvedValue({});
    apiMocks.transitionMutateAsync.mockReset();
    apiMocks.transitionMutateAsync.mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
  });

  it('includes editable summary, priority, status, assignee, and due date cells', () => {
    renderPage();

    expect(screen.getByRole('button', { name: 'First issue' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Assignee' })).toBeInTheDocument();
    expect(screen.getByText('Matt')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-08-30')).toBeInTheDocument();
  });

  it('offers only configured workflow transitions and saves assignee changes', async () => {
    renderPage();

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Edit TEST-1 status' }), {
      key: 'ArrowDown',
    });
    expect(await screen.findByRole('option', { name: 'Open' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Done' }));

    await waitFor(() => {
      expect(apiMocks.transitionMutateAsync).toHaveBeenCalledWith({
        issueKey: 'TEST-1',
        transitionId: 'transition-done',
      });
    });

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Edit TEST-1 assignee' }), {
      key: 'ArrowDown',
    });
    fireEvent.click(await screen.findByRole('option', { name: 'Unassigned' }));

    await waitFor(() => {
      expect(apiMocks.mutateAsync).toHaveBeenCalledWith({
        issueKey: 'TEST-1',
        assigneeId: null,
      });
    });
  });

  it('updates the issue query cache before the request resolves', () => {
    apiMocks.mutateAsync.mockReturnValue(new Promise(() => undefined));
    const { queryClient } = renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'First issue' }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Optimistic edit' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const cachedPages = queryClient.getQueriesData<typeof apiMocks.issuePage>({
      queryKey: ['issues', 'TEST'],
    });
    expect(cachedPages[0]?.[1]?.data[0].summary).toBe('Optimistic edit');
  });

  it('shows read-only cells to users without issues.update permission', () => {
    apiMocks.canEdit = false;
    renderPage();

    expect(screen.queryByRole('button', { name: 'First issue' })).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('2026-08-30')).not.toBeInTheDocument();
    expect(screen.getByText('First issue')).toBeInTheDocument();
    expect(screen.getByText('Matt')).toBeInTheDocument();
  });

  it('shows an error toast when a save fails', async () => {
    apiMocks.mutateAsync.mockRejectedValueOnce(new Error('Network unavailable'));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'First issue' }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Failed edit' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('reverted');
      expect(screen.getByRole('button', { name: 'First issue' })).toBeInTheDocument();
    });
  });
});
