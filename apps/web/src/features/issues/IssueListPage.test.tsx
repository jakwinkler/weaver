import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HotkeysContext } from '@/hooks/useHotkeys';
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
      {
        id: 'issue-2',
        projectId: 'project-1',
        key: 'TEST-2',
        summary: 'Second issue',
        statusId: 'status-open',
        priority: 'high',
        assigneeId: null,
        reporterId: 'user-1',
        customFields: {},
        labels: [],
        sortOrder: 1000,
        dueDate: null,
        percentDone: 0,
        createdAt: '2026-08-26T13:00:00.000Z',
        updatedAt: '2026-08-26T13:00:00.000Z',
      },
    ],
    meta: { page: 1, perPage: 25, total: 2, totalPages: 1 },
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
    useReorderIssues: () => ({ mutateAsync: vi.fn() }),
    useSprints: () => ({ data: [] }),
    useBulkUpdateIssues: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useBulkDeleteIssues: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

function LocationDisplay() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function renderPage(initialEntry = '/projects/TEST/issues') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <HotkeysContext.Provider value="list">
          <LocationDisplay />
          <Routes>
            <Route path="/projects/:projectKey/issues" element={<IssueListPage />} />
            <Route path="/issues/:issueKey" element={<div>Issue detail route</div>} />
          </Routes>
        </HotkeysContext.Provider>
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

  it('offers only configured workflow transitions and saves assignee changes', () => {
    renderPage();

    fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Edit TEST-1 status' }), {
      button: 0,
      ctrlKey: false,
      pointerId: 1,
      pointerType: 'mouse',
    });
    expect(screen.getByRole('option', { name: 'Open' })).toBeInTheDocument();
    const doneOption = screen.getByRole('option', { name: 'Done' });
    fireEvent.click(doneOption);

    expect(apiMocks.transitionMutateAsync).toHaveBeenCalledWith({
      issueKey: 'TEST-1',
      transitionId: 'transition-done',
    });

    fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Edit TEST-1 assignee' }), {
      button: 0,
      ctrlKey: false,
      pointerId: 2,
      pointerType: 'mouse',
    });
    const unassignedOption = screen.getByRole('option', { name: 'Unassigned' });
    fireEvent.click(unassignedOption);

    expect(apiMocks.mutateAsync).toHaveBeenCalledWith({
      issueKey: 'TEST-1',
      assigneeId: null,
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

  it('navigates and selects issues from the keyboard with a visible active row', async () => {
    renderPage();

    fireEvent.keyDown(document, { key: 'j' });
    const firstRow = screen.getByRole('row', { name: /TEST-1 First issue/i });
    await waitFor(() => expect(firstRow).toHaveFocus());
    expect(firstRow).toHaveAttribute('data-keyboard-active', 'true');

    fireEvent.keyDown(firstRow, { key: 'x' });
    expect(screen.getByRole('checkbox', { name: 'Select TEST-1' })).toBeChecked();

    fireEvent.keyDown(firstRow, { key: 'j' });
    const secondRow = screen.getByRole('row', { name: /TEST-2 Second issue/i });
    await waitFor(() => expect(secondRow).toHaveFocus());

    fireEvent.keyDown(secondRow, { key: 'Enter' });
    expect(screen.getByTestId('location')).toHaveTextContent('/issues/TEST-2');
  });

  it('opens and focuses issue creation from the create shortcut URL', async () => {
    renderPage('/projects/TEST/issues?create=1');

    const summaryInput = screen.getByLabelText('Summary');
    expect(summaryInput).toBeInTheDocument();
    await waitFor(() => expect(summaryInput).toHaveFocus());
    expect(screen.getByTestId('location')).toHaveTextContent('/projects/TEST/issues');
  });
});
