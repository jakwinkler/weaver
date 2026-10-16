// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamsPage } from './TeamsPage';

const fixtures = vi.hoisted(() => ({
  teams: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/api', () => ({
  useTeams: () => ({ data: fixtures.teams, isLoading: false }),
  useUsers: () => ({ data: [] }),
  useCreateTeam: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteTeam: () => ({ mutateAsync: vi.fn() }),
  useTeamMembers: () => ({ data: [], isLoading: false }),
  useAddTeamMember: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useRemoveTeamMember: () => ({ mutateAsync: vi.fn() }),
}));

describe('TeamsPage', () => {
  beforeEach(() => {
    fixtures.teams = [{ id: 'team-1', name: 'Security', created_at: '2026-09-03T12:00:00.000Z' }];
  });

  afterEach(cleanup);

  it('renders the creation date returned by the teams API', () => {
    render(<TeamsPage />);

    expect(screen.getByText(/^Created /).textContent).not.toContain('Invalid Date');
  });

  it('omits the creation date when the team has none', () => {
    fixtures.teams = [{ id: 'team-2', name: 'Platform' }];
    render(<TeamsPage />);

    expect(screen.getByText('Platform')).toBeInTheDocument();
    expect(screen.queryByText(/^Created /)).not.toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
  });
});
