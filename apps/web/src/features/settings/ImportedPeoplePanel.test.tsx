// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImportedPeoplePanel } from './ImportedPeoplePanel';
const fixtures = vi.hoisted(() => ({
  post: vi.fn(),
  people: [
    {
      id: 'person-one',
      displayName: 'Original author',
      email: null,
      accountType: 'atlassian',
      sourceActive: true,
      projectIds: ['project'],
      status: 'uninvited',
    },
    {
      id: 'person-two',
      displayName: 'Another author',
      email: 'another@example.test',
      accountType: 'atlassian',
      sourceActive: true,
      projectIds: ['project'],
      status: 'uninvited',
    },
  ],
}));
vi.mock('@/api', () => ({
  useUsers: () => ({ data: [] }),
  useProjects: () => ({ data: { data: [{ id: 'project', name: 'GS trial' }] } }),
}));
vi.mock('@/api/client', () => ({
  apiClient: {
    get: vi.fn(async (path: string) => ({ data: path.endsWith('/people') ? fixtures.people : [] })),
    post: fixtures.post,
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe('Imported people invitation boundary', () => {
  it('creates no invitations until the selected recipients and access have been reviewed and confirmed', async () => {
    fixtures.post.mockResolvedValue({
      data: [
        {
          personId: 'person-one',
          email: 'author@example.test',
          status: 'link_created',
          url: 'https://fixture.example/invite/test',
        },
      ],
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ImportedPeoplePanel />
      </QueryClientProvider>,
    );
    await screen.findByText('Original author');
    expect(fixtures.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Original author/ }));
    fireEvent.change(screen.getByLabelText('Invitation email for Original author'), {
      target: { value: 'author@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review 1 invitation' }));
    expect(fixtures.post).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Invitation review' }).textContent).toContain(
      'viewer, projects: GS trial',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create 1 invitation link' }));
    await waitFor(() => expect(fixtures.post).toHaveBeenCalledTimes(1));
    expect(fixtures.post).toHaveBeenCalledWith('/import/invitations', {
      invitations: [
        {
          personId: 'person-one',
          email: 'author@example.test',
          role: 'viewer',
          projectIds: ['project'],
          delivery: 'link',
        },
      ],
    });
    await screen.findByLabelText('Invitation link for author@example.test');
  });
});
