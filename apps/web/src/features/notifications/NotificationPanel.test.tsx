// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useMarkAllRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from '@/api/hooks-phase5';
import { NotificationPanel } from './NotificationPanel';

vi.mock('@/api/hooks-phase5', () => ({
  useNotifications: vi.fn(),
  useUnreadCount: vi.fn(),
  useMarkNotificationRead: vi.fn(),
  useMarkAllRead: vi.fn(),
}));

const markRead = vi.fn();

function CurrentPath() {
  const location = useLocation();
  return <output aria-label="Current path">{location.pathname}</output>;
}

beforeEach(() => {
  vi.mocked(useUnreadCount).mockReturnValue({ data: 1 } as ReturnType<typeof useUnreadCount>);
  vi.mocked(useNotifications).mockReturnValue({
    data: {
      data: [
        {
          id: 'notification-1',
          userId: 'user-1',
          type: 'mention',
          title: '@You in MNQ-1',
          data: { issueKey: 'MNQ-1', commentId: 'comment-1' },
          isRead: false,
          createdAt: new Date().toISOString(),
        },
      ],
      meta: { page: 1, perPage: 20, total: 1, totalPages: 1 },
    },
    isLoading: false,
  } as unknown as ReturnType<typeof useNotifications>);
  vi.mocked(useMarkNotificationRead).mockReturnValue({
    mutate: markRead,
  } as unknown as ReturnType<typeof useMarkNotificationRead>);
  vi.mocked(useMarkAllRead).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useMarkAllRead>);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('NotificationPanel', () => {
  it('opens a mention notification on its issue route and marks it read', () => {
    render(
      <MemoryRouter initialEntries={['/projects']}>
        <NotificationPanel />
        <CurrentPath />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    fireEvent.click(screen.getByRole('button', { name: /@You in MNQ-1/ }));

    expect(markRead).toHaveBeenCalledWith('notification-1');
    expect(screen.getByRole('status', { name: 'Current path' }).textContent).toBe('/issues/MNQ-1');
  });
});
