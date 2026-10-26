import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '@weaver/shared';
import { ParentIssueField } from './ParentIssueField';

function issueFixture(overrides: Partial<Issue>): Issue {
  return {
    id: 'issue',
    projectId: 'project-1',
    key: 'TEST-1',
    summary: 'Issue',
    statusId: 'todo',
    priority: 'medium',
    reporterId: 'user-1',
    customFields: {},
    labels: [],
    sortOrder: 0,
    percentDone: 0,
    recurrenceRule: null,
    recurrenceParentId: null,
    recurrenceOccurrence: 0,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  };
}

const projectIssues = vi.hoisted(() => ({ data: [] as Issue[], requested: [] as unknown[] }));

vi.mock('@/api', () => ({
  useProjectIssues: (params: unknown) => {
    projectIssues.requested.push(params);
    return { data: { data: projectIssues.data }, isLoading: false, isError: false };
  },
}));

const story = issueFixture({ id: 'story', key: 'TEST-1', summary: 'Checkout story' });
const current = issueFixture({ id: 'current', key: 'TEST-2', summary: 'Current task' });
const child = issueFixture({ id: 'child', key: 'TEST-3', summary: 'Child of current', parentId: 'current' });
const grandchild = issueFixture({ id: 'grandchild', key: 'TEST-4', summary: 'Grandchild', parentId: 'child' });
const epicChild = issueFixture({ id: 'epic-child', key: 'TEST-5', summary: 'In current as epic', epicId: 'current' });
const unrelated = issueFixture({ id: 'other', key: 'TEST-6', summary: 'Payments bug' });

function renderField(issue: Issue, onChange = vi.fn().mockResolvedValue(undefined), canUpdate = true) {
  render(
    <MemoryRouter>
      <ParentIssueField issue={issue} projectKey="TEST" canUpdate={canUpdate} onChange={onChange} />
    </MemoryRouter>,
  );
  return onChange;
}

afterEach(() => {
  cleanup();
  projectIssues.data = [];
  projectIssues.requested = [];
});

describe('ParentIssueField', () => {
  it('links to the parent by key and summary', () => {
    renderField({ ...current, parentId: 'story', parent: { id: 'story', key: 'TEST-1', summary: 'Checkout story' } });

    const link = screen.getByRole('link', { name: 'TEST-1 Checkout story' });
    expect(link).toHaveAttribute('href', '/issues/TEST-1');
    expect(screen.getByRole('button', { name: 'Change' })).toBeVisible();
  });

  it('shows no edit control without update rights and does not load issues', () => {
    renderField(current, vi.fn(), false);

    expect(screen.getByText('None')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Set parent' })).not.toBeInTheDocument();
    expect(projectIssues.requested).toEqual([]);
  });

  it('sets a parent picked from the same project', async () => {
    projectIssues.data = [story, current, unrelated];
    const onChange = renderField(current);

    fireEvent.click(screen.getByRole('button', { name: 'Set parent' }));
    expect(projectIssues.requested).toContainEqual({ projectKey: 'TEST', all: true });
    fireEvent.change(screen.getByLabelText('Find a parent issue'), { target: { value: 'checkout' } });
    const options = within(screen.getByRole('list', { name: 'Parent issue options' }));
    expect(options.queryByText('Payments bug')).not.toBeInTheDocument();
    fireEvent.click(options.getByRole('button', { name: 'TEST-1 Checkout story' }));

    expect(onChange).toHaveBeenCalledWith('story');
    await waitFor(() => expect(screen.queryByLabelText('Find a parent issue')).not.toBeInTheDocument());
  });

  it('leaves out the issue itself and everything under it', () => {
    projectIssues.data = [story, current, child, grandchild, epicChild, unrelated];
    renderField(current);

    fireEvent.click(screen.getByRole('button', { name: 'Set parent' }));

    const options = within(screen.getByRole('list', { name: 'Parent issue options' }));
    expect(options.getAllByRole('button').map((option) => option.textContent)).toEqual([
      'TEST-1 Checkout story',
      'TEST-6 Payments bug',
    ]);
  });

  it('clears the parent', () => {
    projectIssues.data = [story, current];
    const onChange = renderField({ ...current, parentId: 'story', parent: { id: 'story', key: 'TEST-1', summary: 'Checkout story' } });

    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove parent' }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('keeps the picker open and says so when the change fails', async () => {
    projectIssues.data = [story, current];
    renderField(current, vi.fn().mockRejectedValue(new Error('cycle')));

    fireEvent.click(screen.getByRole('button', { name: 'Set parent' }));
    fireEvent.click(screen.getByRole('button', { name: 'TEST-1 Checkout story' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not change the parent.');
    expect(screen.getByLabelText('Find a parent issue')).toBeVisible();
  });
});
