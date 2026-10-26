import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Issue, IssueType } from '@weaver/shared';
import { SubtasksSection } from './SubtasksSection';

const api = vi.hoisted(() => ({
  subtasks: [] as Partial<Issue>[],
  issueTypes: [] as Partial<IssueType>[],
  typesLoading: false,
  refetchTypes: vi.fn(),
  requested: [] as unknown[],
  create: vi.fn(),
  createFailed: false,
}));

vi.mock('@/api', () => ({
  useProjectIssues: (params: unknown) => {
    api.requested.push(params);
    return { data: { data: api.subtasks }, isLoading: false, isError: false };
  },
  useProjectIssueTypes: () => ({
    data: api.typesLoading ? undefined : api.issueTypes,
    isLoading: api.typesLoading,
    refetch: api.refetchTypes,
  }),
  useCreateIssue: () => ({ mutateAsync: api.create, isPending: false, isError: api.createFailed }),
}));

const parent = { id: 'parent-id', key: 'TEST-1', summary: 'Parent story' } as Issue;
const statuses: Record<string, { name: string; color: string }> = {
  todo: { name: 'To Do', color: '#6b7280' },
  done: { name: 'Done', color: '#16a34a' },
};

function renderSection(canCreate = true) {
  return render(
    <MemoryRouter>
      <SubtasksSection
        issue={parent}
        projectKey="TEST"
        canCreate={canCreate}
        statusName={(id) => statuses[id]?.name ?? id}
        statusColor={(id) => statuses[id]?.color ?? '#6b7280'}
      />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  api.subtasks = [];
  api.issueTypes = [];
  api.typesLoading = false;
  api.refetchTypes.mockReset();
  api.requested = [];
  api.create.mockReset();
  api.createFailed = false;
});

describe('SubtasksSection', () => {
  it("lists the issue's children with status and assignee", () => {
    api.subtasks = [
      { id: 'c1', key: 'TEST-2', summary: 'Write the copy', statusId: 'done', assigneeId: 'u1', assigneeDisplayName: 'Imported Person' },
      { id: 'c2', key: 'TEST-3', summary: 'Ship it', statusId: 'todo', assigneeId: undefined },
    ];
    renderSection();

    expect(api.requested).toContainEqual({ projectKey: 'TEST', parentId: 'parent-id', all: true });
    const rows = within(screen.getByRole('list', { name: 'Subtasks' })).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'TEST-2Write the copyDoneImported Person',
      'TEST-3Ship itTo DoUnassigned',
    ]);
    expect(within(rows[0]).getByRole('link', { name: 'TEST-2' })).toHaveAttribute('href', '/issues/TEST-2');
  });

  it('says when there are no subtasks', () => {
    renderSection();

    expect(screen.getByText('No subtasks yet.')).toBeVisible();
  });

  it('hides Add subtask without create rights', () => {
    renderSection(false);

    expect(screen.queryByRole('button', { name: 'Add subtask' })).not.toBeInTheDocument();
  });

  it('creates a child of this issue with the subtask type by default', async () => {
    api.issueTypes = [
      { id: 'task-type', name: 'Task', isSubtask: false },
      { id: 'subtask-type', name: 'Sub-task', isSubtask: true },
    ];
    api.create.mockResolvedValue({ key: 'TEST-4' });
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'Add subtask' }));
    expect(screen.getByLabelText('Type')).toHaveValue('subtask-type');
    fireEvent.change(screen.getByLabelText('Subtask summary'), { target: { value: 'Draft the email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create subtask' }));

    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({ summary: 'Draft the email', parentId: 'parent-id', issueTypeId: 'subtask-type' }),
    );
    // The form stays open and empty for the next subtask.
    await waitFor(() => expect(screen.getByLabelText('Subtask summary')).toHaveValue(''));
  });

  it('uses the type someone picks and sends no type when there is no subtask type', async () => {
    api.issueTypes = [{ id: 'task-type', name: 'Task', isSubtask: false }];
    api.create.mockResolvedValue({ key: 'TEST-4' });
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'Add subtask' }));
    expect(screen.getByLabelText('Type')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Subtask summary'), { target: { value: 'Untyped' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create subtask' }));
    expect(api.create).toHaveBeenLastCalledWith(expect.not.objectContaining({ issueTypeId: expect.anything() }));
    await waitFor(() => expect(screen.getByLabelText('Subtask summary')).toHaveValue(''));

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'task-type' } });
    fireEvent.change(screen.getByLabelText('Subtask summary'), { target: { value: 'Typed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create subtask' }));
    expect(api.create).toHaveBeenLastCalledWith(expect.objectContaining({ summary: 'Typed', issueTypeId: 'task-type' }));
  });

  it('waits for the issue types so a quick submit still gets the subtask type', async () => {
    api.typesLoading = true;
    api.refetchTypes.mockResolvedValue({ data: [{ id: 'subtask-type', name: 'Sub-task', isSubtask: true }] });
    api.create.mockResolvedValue({ key: 'TEST-4' });
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'Add subtask' }));
    fireEvent.change(screen.getByLabelText('Subtask summary'), { target: { value: 'Too quick' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create subtask' }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ summary: 'Too quick', issueTypeId: 'subtask-type' })),
    );
    expect(api.refetchTypes).toHaveBeenCalled();
  });

  it('keeps the summary when creating fails', async () => {
    api.create.mockRejectedValue(new Error('nope'));
    api.createFailed = true;
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'Add subtask' }));
    fireEvent.change(screen.getByLabelText('Subtask summary'), { target: { value: 'Keep me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create subtask' }));

    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(screen.getByLabelText('Subtask summary')).toHaveValue('Keep me');
    expect(screen.getByRole('alert')).toHaveTextContent('Could not create the subtask.');
  });
});
