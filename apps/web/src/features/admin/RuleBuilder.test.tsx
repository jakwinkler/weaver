// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RuleBuilder } from './RuleBuilder';

afterEach(cleanup);

describe('RuleBuilder', () => {
  it('completes the four-step rule creation flow', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <RuleBuilder
        open
        onOpenChange={() => undefined}
        onSubmit={onSubmit}
        projects={[]}
        users={[]}
        statuses={[]}
        issueTypes={[]}
      />,
    );

    fireEvent.change(screen.getByLabelText('Rule name'), {
      target: { value: 'Label new issues' },
    });
    fireEvent.change(screen.getByLabelText('When should this rule run?'), {
      target: { value: 'issue.created' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('This rule runs every time the trigger fires.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'triage' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Label new issues')).toBeInTheDocument();
    expect(screen.getByText('Add label “triage”')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create rule' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      projectId: null,
      name: 'Label new issues',
      enabled: true,
      trigger: { type: 'issue.created' },
      conditions: [],
      actions: [{ type: 'add_label', label: 'triage' }],
    });
  });

  it('keeps users on an incomplete action step with a useful error', () => {
    render(
      <RuleBuilder
        open
        onOpenChange={() => undefined}
        onSubmit={vi.fn()}
        projects={[]}
        users={[]}
        statuses={[]}
        issueTypes={[]}
      />,
    );

    fireEvent.change(screen.getByLabelText('Rule name'), { target: { value: 'Incomplete rule' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Action 1 is incomplete.');
    expect(screen.getByText('Step 3 of 4: Actions')).toBeInTheDocument();
  });

  it('creates a named schedule with an issue query condition', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <RuleBuilder
        open
        onOpenChange={() => undefined}
        onSubmit={onSubmit}
        projects={[]}
        users={[]}
        statuses={[]}
        issueTypes={[]}
      />,
    );

    fireEvent.change(screen.getByLabelText('Rule name'), {
      target: { value: 'Mark overdue issues' },
    });
    fireEvent.change(screen.getByLabelText('When should this rule run?'), {
      target: { value: 'schedule.daily_9am' },
    });
    expect(screen.getByText('Every day at 9:00 AM UTC')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.click(screen.getByRole('button', { name: 'Add condition' }));
    expect(screen.getByLabelText('Operator')).toHaveValue('before');
    expect(screen.getByLabelText('Value')).toHaveValue('now');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'overdue' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create rule' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: { type: 'schedule', schedule: 'daily_9am' },
        conditions: [{ type: 'query', field: 'dueDate', operator: 'before', value: 'now' }],
      }),
    );
  });
});
