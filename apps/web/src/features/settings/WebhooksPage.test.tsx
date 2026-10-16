// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/hooks-phase5', () => ({
  useWebhooks: () => ({ data: [], isLoading: false }),
  useCreateWebhook: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteWebhook: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTestWebhook: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useWebhookDeliveries: () => ({ data: [], isLoading: false }),
}));

import { WebhooksPage } from './WebhooksPage';

afterEach(() => {
  cleanup();
});

function openCreateForm() {
  render(<WebhooksPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Add Webhook' }));
}

describe('WebhooksPage event picker', () => {
  it('offers the sprint and time events the API sends, under the names it sends them', () => {
    openCreateForm();

    for (const event of [
      'comment.created',
      'sprint.created',
      'sprint.updated',
      'sprint.started',
      'sprint.completed',
      'sprint.deleted',
      'time.logged',
      'time.updated',
      'time.deleted',
    ]) {
      expect(screen.getByRole('button', { name: event })).toBeInTheDocument();
    }
    // The API emits comment.created and has no project.deleted event.
    expect(screen.queryByRole('button', { name: 'comment.added' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'project.deleted' })).not.toBeInTheDocument();
  });

  it('shows the sprint payload with its project instead of a board', () => {
    openCreateForm();

    fireEvent.click(screen.getByRole('button', { name: 'sprint.created' }));

    const preview = screen.getByText(/"sprintId"/);
    expect(preview).toHaveTextContent('"projectKey": "PROJ"');
    expect(preview).toHaveTextContent('"projectId": "project-uuid"');
    expect(preview).toHaveTextContent('"userId": "user-uuid"');
    expect(preview).not.toHaveTextContent('boardId');
  });
});
