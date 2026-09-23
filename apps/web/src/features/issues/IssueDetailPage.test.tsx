import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HotkeysContext } from '@/hooks/useHotkeys';
import { IssueDetailPage } from './IssueDetailPage';

const apiMocks = vi.hoisted(() => ({
  update: vi.fn(),
  transition: vi.fn(),
}));

vi.mock('@/api', () => ({
  useHasPermission: () => true,
  useIssue: () => ({
    data: {
      id: 'issue-1',
      key: 'TEST-1',
      summary: 'Keyboard shortcuts',
      description: null,
      statusId: 'todo',
      priority: 'medium',
      assigneeId: null,
      reporterId: 'user-1',
      labels: [],
      startDate: null,
      dueDate: null,
      percentDone: 0,
      recurrenceRule: null,
      recurrenceParentId: null,
      recurrenceOccurrence: 0,
      createdAt: '2026-08-27T12:00:00.000Z',
      updatedAt: '2026-08-27T12:00:00.000Z',
    },
    isLoading: false,
  }),
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
  useWorkflow: () => ({
    data: { statuses: [{ id: 'todo', name: 'To Do', color: '#6b7280' }] },
  }),
  useWorkflowTransitions: () => ({
    data: [{ id: 'done', name: 'Done', toStatus: { name: 'Done', color: '#16a34a' } }],
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/issues/TEST-1']}>
      <HotkeysContext.Provider value="detail">
        <Routes>
          <Route path="/issues/:issueKey" element={<IssueDetailPage />} />
        </Routes>
      </HotkeysContext.Provider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

describe('IssueDetailPage keyboard shortcuts', () => {
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
