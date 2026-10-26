// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImportedPeoplePanel, suggestMember } from './ImportedPeoplePanel';
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
    {
      id: 'person-three',
      displayName: 'Margaret Petre',
      email: null,
      accountType: 'atlassian',
      sourceActive: true,
      projectIds: ['project'],
      status: 'uninvited',
    },
  ],
  users: [
    { id: 'member-matt', email: 'matt@example.test', displayName: 'Matt MacDougall' },
    { id: 'member-margaret', email: 'margaret@example.test', displayName: 'Margaret' },
  ],
}));
vi.mock('@/api', () => ({
  useUsers: () => ({ data: fixtures.users }),
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

  it('suggests a matching member and links only after the attribution change is confirmed', async () => {
    fixtures.post.mockResolvedValue({ data: {} });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ImportedPeoplePanel />
      </QueryClientProvider>,
    );
    const select = (await screen.findByLabelText(
      'Existing member for Margaret Petre',
    )) as HTMLSelectElement;
    expect(select.value).toBe('member-margaret');
    expect(
      (screen.getByLabelText('Existing member for Original author') as HTMLSelectElement).value,
    ).toBe('');
    const row = within(select.parentElement!);
    expect(row.getByText('Suggested by name')).toBeTruthy();
    fireEvent.click(row.getByRole('button', { name: 'Link' }));
    expect(fixtures.post).not.toHaveBeenCalled();
    expect(
      screen.getByRole('region', { name: 'Link review for Margaret Petre' }).textContent,
    ).toContain('attributed to Margaret');
    fireEvent.click(screen.getByRole('button', { name: 'Link to Margaret' }));
    await waitFor(() => expect(fixtures.post).toHaveBeenCalledTimes(1));
    expect(fixtures.post).toHaveBeenCalledWith('/import/people/person-three/link', {
      userId: 'member-margaret',
    });
  });

  it('suggests members by email first and never on an ambiguous name', () => {
    const person = (displayName: string, email: string | null = null) => ({
      ...fixtures.people[0],
      displayName,
      email,
      inviteEmail: null,
    });
    const users = fixtures.users as never[];
    expect(suggestMember(person('Margaret Petre'), users)?.user.id).toBe('member-margaret');
    expect(suggestMember(person('Someone', 'MATT@example.test'), users)).toMatchObject({
      user: { id: 'member-matt' },
      reason: 'email',
    });
    expect(suggestMember(person('Original author'), users)).toBeNull();
    expect(
      suggestMember(person('Margaret'), [
        ...users,
        { id: 'member-two', email: 'm2@example.test', displayName: 'Margaret Jones' } as never,
      ]),
    ).toBeNull();
  });
});
