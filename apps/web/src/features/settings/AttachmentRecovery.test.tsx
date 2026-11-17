// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AttachmentRecovery } from './AttachmentRecovery';
const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/api/client', () => ({ apiClient: mocks }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('submits only selected failures with fresh credentials and clears the token on success', async () => {
  mocks.post.mockResolvedValue({ data: { id: 'recovery' } });
  const onStarted = vi.fn();
  render(
    <AttachmentRecovery
      onStarted={onStarted}
      job={
        {
          id: 'original',
          source: 'jira_cloud',
          sourceUrl: 'https://fixture.example',
          errors: [
            { itemType: 'attachment', itemId: '1', filename: 'one.mp4' },
            { itemType: 'attachment', itemId: '2', filename: 'two.mp4' },
          ],
        } as never
      }
    />,
  );
  fireEvent.click(screen.getByLabelText('one.mp4'));
  fireEvent.change(screen.getByLabelText('Jira email'), {
    target: { value: 'reader@example.test' },
  });
  fireEvent.change(screen.getByLabelText('Jira token'), { target: { value: 'fixture-secret' } });
  fireEvent.click(screen.getByRole('button', { name: 'Retry 1 attachment' }));
  await waitFor(() => expect(onStarted).toHaveBeenCalledWith('recovery'));
  expect(mocks.post).toHaveBeenCalledWith('/import/jira/retry-attachments/original', {
    attachmentIds: ['1'],
    config: {
      source: 'jira_cloud',
      baseUrl: 'https://fixture.example',
      auth: { type: 'api_token', token: 'fixture-secret', email: 'reader@example.test' },
    },
  });
  expect((screen.getByLabelText('Jira token') as HTMLInputElement).value).toBe('');
});
