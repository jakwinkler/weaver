// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardConfig } from '@weaver/shared';
import { BoardSettings } from './BoardSettings';

const todoId = '550e8400-e29b-41d4-a716-446655440000';
const doingId = '550e8400-e29b-41d4-a716-446655440001';

const statuses = [
  { id: todoId, name: 'To Do' },
  { id: doingId, name: 'In Progress' },
];

afterEach(cleanup);

describe('BoardSettings', () => {
  it('shows the persisted grouping and disables changes without board permission', () => {
    render(
      <BoardSettings
        config={{ swimlaneField: 'priority' }}
        statuses={statuses}
        canConfigure={false}
        isSaving={false}
        onConfigChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Group by' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Priority')).not.toBeNull();
    expect(
      screen.getByRole('button', { name: 'Configure WIP limits' }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('saves positive limits and removes a cleared limit', () => {
    const onConfigChange = vi.fn<(config: BoardConfig) => void>();
    render(
      <BoardSettings
        config={{ swimlaneField: 'assignee', wipLimits: { [todoId]: 2 } }}
        statuses={statuses}
        canConfigure
        isSaving={false}
        onConfigChange={onConfigChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Configure WIP limits' }));
    fireEvent.change(screen.getByLabelText('To Do limit'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('In Progress limit'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save limits' }));

    expect(onConfigChange).toHaveBeenCalledWith({
      swimlaneField: 'assignee',
      wipLimits: { [doingId]: 3 },
    });
  });
});
