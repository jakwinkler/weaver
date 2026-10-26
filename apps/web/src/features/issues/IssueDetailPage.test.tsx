import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HotkeysContext } from '@/hooks/useHotkeys';
import { IssueDetailPage } from './IssueDetailPage';

const apiMocks = vi.hoisted(() => {
  const baseIssue = {
    id: 'issue-1',
    key: 'TEST-1',
    summary: 'Keyboard shortcuts',
    description: null,
    statusId: 'todo',
    priority: 'medium',
    assigneeId: null as string | null,
    reporterId: 'user-1',
    labels: [] as string[],
    startDate: null,
    dueDate: null,
    percentDone: 0,
    recurrenceRule: null,
    recurrenceParentId: null,
    recurrenceOccurrence: 0,
    createdAt: '2026-08-27T12:00:00.000Z',
    updatedAt: '2026-08-27T12:00:00.000Z',
    parentId: null as string | null,
    parent: null as { id: string; key: string; summary: string } | null,
  };
  return {
    baseIssue,
    // Replacing this object stands in for a refetch after a live update.
    issue: baseIssue,
    update: vi.fn(),
    transition: vi.fn(),
  };
});

vi.mock('@/api', () => ({
  useHasPermission: () => true,
  useCreateIssue: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useProjectIssueTypes: () => ({ data: [] }),
  useProjectIssues: (params: { parentId?: string }) => ({
    data: {
      data: params.parentId
        ? [{ id: 'issue-2', key: 'TEST-2', summary: 'First subtask', statusId: 'todo', assigneeId: null }]
        : [],
    },
    isLoading: false,
    isError: false,
  }),
  useIssue: () => ({ data: apiMocks.issue, isLoading: false }),
  useIssueRecurrence: () => ({ data: [] }),
  useProject: () => ({ data: { workflowId: 'workflow-1' } }),
  useTransitionIssue: () => ({ mutateAsync: apiMocks.transition, isPending: false }),
  useUpdateIssue: () => ({
    mutate: apiMocks.update,
    mutateAsync: apiMocks.update,
    isError: false,
    isPending: false,
  }),
  useUsers: () => ({
    data: [{ id: 'user-1', displayName: 'Matt', email: 'matt@example.com' }],
  }),
  useProjectWorkflow: () => ({
    data: {
      statuses: [{ id: 'todo', name: 'To Do', color: '#6b7280' }],
      transitions: [
        {
          id: 'done',
          fromStatusId: 'todo',
          name: 'Done',
          toStatus: { name: 'Done', color: '#16a34a' },
        },
      ],
    },
  }),
}));

vi.mock('./IssueActivityTabs', () => ({ IssueActivityTabs: () => null }));
vi.mock('@/plugins', () => ({ PluginSlot: () => null }));
vi.mock('@/components/RichTextEditor', () => ({
  RichTextEditor: () => <div>Rich text fixture</div>,
  normalizeCommentBody: (value: unknown) => value,
}));

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

function page() {
  return (
    <MemoryRouter initialEntries={['/issues/TEST-1']}>
      <HotkeysContext.Provider value="detail">
        <Routes>
          <Route path="/issues/:issueKey" element={<IssueDetailPage />} />
        </Routes>
      </HotkeysContext.Provider>
    </MemoryRouter>
  );
}

function renderPage() {
  return render(page());
}

beforeEach(() => {
  apiMocks.issue = apiMocks.baseIssue;
});

afterEach(() => {
  cleanup();
});

describe('IssueDetailPage keyboard shortcuts', () => {
  it('offers an explicit Add details action when the issue has no description', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Add details' })).toBeVisible();
  });
  it('enters edit mode with e and cancels it with Escape', async () => {
    renderPage();

    fireEvent.keyDown(document, { key: 'e' });
    const summaryInput = screen.getByLabelText('Summary');
    await waitFor(() => expect(summaryInput).toHaveFocus());
    fireEvent.change(summaryInput, { target: { value: 'Discarded change' } });

    fireEvent.keyDown(summaryInput, { key: 'Escape' });

    expect(screen.queryByLabelText('Summary')).not.toBeInTheDocument();
    expect(screen.getByText('Keyboard shortcuts')).toBeInTheDocument();
  });

  it('opens assignee and status menus with contextual keys', () => {
    renderPage();

    fireEvent.keyDown(document, { key: 'a' });
    expect(screen.getByText('Unassign')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });

    fireEvent.keyDown(document, { key: 's' });
    expect(screen.getByRole('menuitem', { name: 'Done' })).toBeInTheDocument();
  });
});

describe('IssueDetailPage hierarchy', () => {
  it('shows the parent in the breadcrumb and details', () => {
    apiMocks.issue = {
      ...apiMocks.baseIssue,
      parentId: 'parent-1',
      parent: { id: 'parent-1', key: 'TEST-9', summary: 'Parent story' },
    };
    renderPage();

    expect(screen.getByRole('link', { name: 'TEST-9' })).toHaveAttribute('href', '/issues/TEST-9');
    expect(screen.getByRole('link', { name: 'TEST-9 Parent story' })).toBeVisible();
  });

  it('lists subtasks with their status', () => {
    renderPage();

    const subtasks = screen.getByRole('list', { name: 'Subtasks' });
    expect(subtasks).toHaveTextContent('TEST-2First subtaskTo DoUnassigned');
    expect(screen.getByRole('button', { name: 'Add subtask' })).toBeVisible();
  });
});

describe('IssueDetailPage live updates', () => {
  it('keeps the edit draft and flags a server update made while editing', () => {
    const { rerender } = renderPage();

    fireEvent.keyDown(document, { key: 'e' });
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'My draft summary' } });
    expect(screen.queryByText(/updated while you were editing/)).not.toBeInTheDocument();

    apiMocks.issue = {
      ...apiMocks.baseIssue,
      summary: 'Teammate summary',
      updatedAt: '2026-08-27T12:05:00.000Z',
    };
    rerender(page());

    expect(screen.getByLabelText('Summary')).toHaveValue('My draft summary');
    expect(screen.getByRole('status')).toHaveTextContent(
      'This issue was updated while you were editing.',
    );
  });

  it('does not flag server changes to fields outside the edit form', () => {
    const { rerender } = renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'My draft summary' } });
    apiMocks.issue = { ...apiMocks.baseIssue, assigneeId: 'user-1' };
    rerender(page());

    expect(screen.getByLabelText('Summary')).toHaveValue('My draft summary');
    expect(screen.queryByText(/updated while you were editing/)).not.toBeInTheDocument();
  });

  it('starts each edit from the latest server values', () => {
    const { rerender } = renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Abandoned draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    apiMocks.issue = { ...apiMocks.baseIssue, summary: 'Teammate summary' };
    rerender(page());
    fireEvent.keyDown(document, { key: 'e' });

    expect(screen.getByLabelText('Summary')).toHaveValue('Teammate summary');
    expect(screen.queryByText(/updated while you were editing/)).not.toBeInTheDocument();
  });

  it('drops the edit draft when another issue opens', () => {
    render(
      <MemoryRouter initialEntries={['/issues/TEST-1']}>
        <HotkeysContext.Provider value="detail">
          <Link to="/issues/TEST-2">Open TEST-2</Link>
          <Routes>
            <Route path="/issues/:issueKey" element={<IssueDetailPage />} />
          </Routes>
        </HotkeysContext.Provider>
      </MemoryRouter>,
    );

    fireEvent.keyDown(document, { key: 'e' });
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Draft for TEST-1' } });
    fireEvent.click(screen.getByRole('link', { name: 'Open TEST-2' }));

    expect(screen.queryByLabelText('Summary')).not.toBeInTheDocument();
  });

  it('keeps an unsaved recurrence change when the issue refetches', () => {
    const { rerender } = renderPage();

    fireEvent.change(screen.getByLabelText('Repeat'), { target: { value: 'daily' } });
    apiMocks.issue = { ...apiMocks.baseIssue, summary: 'Teammate summary' };
    rerender(page());

    expect(screen.getByLabelText('Repeat')).toHaveValue('daily');
    expect(screen.getByRole('button', { name: 'Save recurrence' })).toBeInTheDocument();
  });
});
