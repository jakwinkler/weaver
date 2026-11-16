// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowStatus } from '@weaver/shared';
import { AddStatusPanel } from './AddStatusPanel';
import { EditPanel } from './EditPanel';
import { STATUS_FIELD_HELP } from './statusFieldHelp';

vi.mock('@/api/hooks-admin', () => ({
  useAddWorkflowStatus: () => ({ isPending: false, mutate: vi.fn() }),
  useUpdateWorkflowStatus: () => ({ isPending: false, mutate: vi.fn() }),
  useUpdateWorkflowTransition: () => ({ isPending: false, mutate: vi.fn() }),
}));

const status: WorkflowStatus = {
  id: 'status-1',
  workflowId: 'workflow-1',
  name: 'Testing',
  category: 'in_progress',
  color: '#F59E0B',
  isInitial: false,
  isTerminal: false,
  position: 2,
};

function expectStatusFieldHelp() {
  expect(screen.getByRole('combobox')).toHaveAccessibleDescription(STATUS_FIELD_HELP.category);
  expect(screen.getByRole('checkbox', { name: 'Initial' })).toHaveAccessibleDescription(
    STATUS_FIELD_HELP.initial,
  );
  expect(screen.getByRole('checkbox', { name: 'Terminal' })).toHaveAccessibleDescription(
    STATUS_FIELD_HELP.terminal,
  );
}

describe('workflow status panels', () => {
  afterEach(cleanup);

  it('explains Category, Initial, and Terminal when adding a status', () => {
    render(<AddStatusPanel workflowId="workflow-1" open onClose={vi.fn()} />);

    expect(screen.getByText(STATUS_FIELD_HELP.category)).toBeVisible();
    expect(screen.getByText(STATUS_FIELD_HELP.initial)).toBeVisible();
    expect(screen.getByText(STATUS_FIELD_HELP.terminal)).toBeVisible();
    expectStatusFieldHelp();
  });

  it('explains Category, Initial, and Terminal when editing a status', () => {
    render(
      <EditPanel
        workflowId="workflow-1"
        selectedStatus={status}
        selectedTransition={null}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(STATUS_FIELD_HELP.category)).toBeVisible();
    expect(screen.getByText(STATUS_FIELD_HELP.initial)).toBeVisible();
    expect(screen.getByText(STATUS_FIELD_HELP.terminal)).toBeVisible();
    expectStatusFieldHelp();
  });

  it('keeps help ids unique when both panels are open', () => {
    render(
      <>
        <AddStatusPanel workflowId="workflow-1" open onClose={vi.fn()} />
        <EditPanel
          workflowId="workflow-1"
          selectedStatus={status}
          selectedTransition={null}
          onClose={vi.fn()}
        />
      </>,
    );

    const ids = screen
      .getAllByText(STATUS_FIELD_HELP.terminal)
      .map((element) => element.getAttribute('id'));
    expect(new Set(ids).size).toBe(2);
  });
});
