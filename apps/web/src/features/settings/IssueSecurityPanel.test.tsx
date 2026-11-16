// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { IssueSecurityPanel } from './IssueSecurityPanel';
const mocks = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock('@/api', () => ({
  useUsers: () => ({ data: [{ id: 'reader', displayName: 'Project Reader', role: 'viewer' }] }),
}));
vi.mock('@/api/client', () => ({ apiClient: mocks }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('requires review of audience additions, scope, and absent project access before applying', async () => {
  mocks.get.mockResolvedValue({
    data: {
      policies: [
        {
          id: 'policy',
          name: 'Internal',
          projectName: 'EPD',
          projectKey: 'EPD',
          projectMemberIds: [],
          userIds: [],
          revision: 3,
          reviewed: false,
          affectedCount: 2,
        },
      ],
      pending: [],
    },
  });
  mocks.post.mockResolvedValue({ data: {} });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <IssueSecurityPanel />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole('checkbox', { name: /Project Reader/ }));
  expect(mocks.post).not.toHaveBeenCalled();
  expect(screen.getByText(/project access also required/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Review issue audience' }));
  expect(screen.getByText('Add: Project Reader')).toBeTruthy();
  expect(screen.getByText('Applies to 2 issues in EPD.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Apply reviewed audience' }));
  await waitFor(() =>
    expect(mocks.post).toHaveBeenCalledWith('/import/issue-security/policy', {
      userIds: ['reader'],
      revision: 3,
      affectedCount: 2,
    }),
  );
});
