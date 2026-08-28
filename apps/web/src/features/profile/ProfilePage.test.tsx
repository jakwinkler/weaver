import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePage } from './ProfilePage';

const updatePreferences = vi.fn();
const profile = {
  id: 'user-1',
  email: 'recipient@example.com',
  displayName: 'Recipient',
  notificationPreferences: {
    emailOnAssign: true,
    emailOnMention: true,
    emailOnComment: true,
    emailOnStatusChange: true,
  },
};

vi.mock('@/api', () => ({
  useProfile: () => ({
    data: profile,
    isLoading: false,
  }),
  useUpdateProfile: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadAvatar: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateNotificationPreferences: () => ({
    mutateAsync: updatePreferences,
    isPending: false,
    isError: false,
  }),
}));

vi.mock('@/stores', () => ({
  useAuthStore: (selector: (state: { updateUser: () => void }) => unknown) =>
    selector({ updateUser: vi.fn() }),
}));

describe('ProfilePage email notification preferences', () => {
  beforeEach(() => {
    updatePreferences.mockReset();
    updatePreferences.mockResolvedValue({});
  });

  it('shows all four preferences and saves a changed toggle', async () => {
    render(<ProfilePage />);

    expect(screen.getByRole('heading', { name: 'Email notifications' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Issue assignments' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Mentions in comments' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'New comments' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Status changes' })).toBeChecked();

    fireEvent.click(screen.getByRole('switch', { name: 'Issue assignments' }));

    await waitFor(() => {
      expect(updatePreferences).toHaveBeenCalledWith({
        emailOnAssign: false,
      });
    });
  });
});
