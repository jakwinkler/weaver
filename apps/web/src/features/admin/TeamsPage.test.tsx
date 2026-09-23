// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeamsPage } from './TeamsPage';

vi.mock('@/api', () => ({
  useTeams: () => ({
    data: [{ id: 'team-1', name: 'Security', created_at: '2026-09-03T12:00:00.000Z' }],
    isLoading: false,
  }),
  useUsers: () => ({ data: [] }),
  useCreateTeam: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteTeam: () => ({ mutateAsync: vi.fn() }),
  useTeamMembers: () => ({ data: [], isLoading: false }),
  useAddTeamMember: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useRemoveTeamMember: () => ({ mutateAsync: vi.fn() }),
}));

describe('TeamsPage', () => {
  afterEach(cleanup);

  it('renders the creation date returned by the teams API', () => {
    render(<TeamsPage />);

    expect(screen.getByText(/^Created /).textContent).not.toContain('Invalid Date');
  });
});
