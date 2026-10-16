// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersPage } from './UsersPage';

const createInvitation = vi.fn();
const revokeInvitation = vi.fn();
const pendingInvitations = [
  {
    id: 'inv-1',
    email: 'pending@example.com',
    role: 'viewer',
    expiresAt: '2026-10-22T12:00:00.000Z',
    createdAt: '2026-10-15T12:00:00.000Z',
  },
];

vi.mock('@/api', () => ({
  useUsers: () => ({ data: [], isLoading: false }),
  useUpdateUserRole: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCreateInvitation: () => ({ isPending: false, isError: false, mutateAsync: createInvitation }),
  usePendingInvitations: () => ({ data: pendingInvitations, isLoading: false }),
  useRevokeInvitation: () => ({ isPending: false, isError: false, mutateAsync: revokeInvitation }),
}));

describe('UsersPage invitations', () => {
  beforeEach(() => {
    createInvitation.mockReset();
    revokeInvitation.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lists pending invitations with email, role, and expiry', () => {
    render(<UsersPage />);

    const table = screen.getByRole('table', { name: 'Pending invitations' });
    const row = within(table).getByText('pending@example.com').closest('tr')!;
    expect(within(row).getByText('viewer')).toBeTruthy();
    expect(within(row).getByText(new Date('2026-10-22T12:00:00.000Z').toLocaleString())).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Revoke invitation for pending@example.com' })).toBeTruthy();
  });

  it('revokes an invitation after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<UsersPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Revoke invitation for pending@example.com' }));

    expect(confirm).toHaveBeenCalled();
    await waitFor(() => expect(revokeInvitation).toHaveBeenCalledWith('inv-1'));
  });

  it('keeps the invitation when revocation is not confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<UsersPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Revoke invitation for pending@example.com' }));

    expect(revokeInvitation).not.toHaveBeenCalled();
  });

  it('warns that the generated link works for anyone until used, revoked, or expired', async () => {
    createInvitation.mockResolvedValue({
      id: 'inv-2',
      token: 'a'.repeat(64),
      email: 'new@example.com',
      expiresAt: '2026-10-22T12:00:00.000Z',
    });
    render(<UsersPage />);

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'new@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create invitation' }));

    const link = await screen.findByLabelText('Invitation link');
    expect((link as HTMLInputElement).value).toBe(`${window.location.origin}/invite/${'a'.repeat(64)}`);
    expect(screen.getByText(
      'Anyone who has this link can join as that person until it is used, revoked, or expires in 7 days, so send it privately.',
    )).toBeTruthy();
  });
});
