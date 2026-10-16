// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImportedFileAccess } from './ImportedFileAccess';
const fixture = vi.hoisted(() => ({ post: vi.fn(), role: 'owner' }));
vi.mock('@/api', () => ({ useCurrentUser: () => ({ data: { role: fixture.role } }) }));
vi.mock('@/api/client', () => ({
  apiClient: {
    get: async () => ({
      data: [
        {
          id: 'internal',
          sourceInstance: 'jira',
          kind: 'role',
          identifier: 'internal',
          name: 'Internal',
        },
      ],
    }),
    post: fixture.post,
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const file = {
  id: 'file',
  filename: 'private.txt',
  sourceId: 'source-file',
  visibility: {
    sourceInstance: 'jira',
    type: 'unknown',
    identifier: 'review',
    value: 'Requires review',
  },
};
function show() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ImportedFileAccess file={file} issueKey="GS-1" />
    </QueryClientProvider>,
  );
}
describe('Imported file access review', () => {
  it('requires an explicit audience choice and apply action before releasing a file', async () => {
    fixture.role = 'owner';
    fixture.post.mockResolvedValue({ data: {} });
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Review file access' }));
    await screen.findByRole('option', { name: 'Internal' });
    expect(fixture.post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'internal' } });
    expect(fixture.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply file access' }));
    await waitFor(() =>
      expect(fixture.post).toHaveBeenCalledWith('/import/attachments/file/visibility', {
        audienceId: 'internal',
      }),
    );
  });
  it('does not offer access changes to a project viewer', () => {
    fixture.role = 'viewer';
    show();
    expect(screen.queryByRole('button', { name: 'Review file access' })).toBeNull();
    expect(fixture.post).not.toHaveBeenCalled();
  });
});
