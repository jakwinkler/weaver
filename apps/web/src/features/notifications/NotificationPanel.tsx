import { useState, useRef, useEffect } from 'react';
import {
  useNotifications,
  useUnreadCount,
  useMarkNotificationRead,
  useMarkAllRead,
} from '@/api/hooks-phase5';

const NOTIFICATION_TYPE_ICONS: Record<string, string> = {
  'issue.assigned': 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  'issue.commented': 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  'issue.status_changed': 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  'sprint.started': 'M13 10V3L4 14h7v7l9-11h-7z',
  'sprint.completed': 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  'mention': 'M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207',
};

const DEFAULT_ICON_PATH = 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9';

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;

  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(dateStr).toLocaleDateString();
}

export function NotificationPanel() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data: unreadCount } = useUnreadCount();
  const { data: notifications, isLoading } = useNotifications(1, 20);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllRead();

  // Close panel when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const handleNotificationClick = (notification: { id: string; isRead: boolean; data: Record<string, unknown> }) => {
    if (!notification.isRead) {
      markRead.mutate(notification.id);
    }

    // Navigate to linked issue if data includes issueKey
    if (notification.data.issueKey) {
      const projectKey = (notification.data.issueKey as string).split('-')[0];
      window.location.href = `/projects/${projectKey}/issues/${notification.data.issueKey}`;
    }
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate();
  };

  return (
    <div ref={panelRef} className="relative">
      {/* Bell icon button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        aria-label="Notifications"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d={DEFAULT_ICON_PATH}
          />
        </svg>

        {/* Unread badge */}
        {unreadCount != null && unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-96 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            {unreadCount != null && unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={markAllRead.isPending}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
              >
                {markAllRead.isPending ? 'Marking...' : 'Mark all read'}
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-gray-500">Loading notifications...</p>
              </div>
            ) : !notifications || notifications.data.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <svg
                  className="mx-auto h-8 w-8 text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={DEFAULT_ICON_PATH}
                  />
                </svg>
                <p className="mt-2 text-sm text-gray-400">No notifications yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notifications.data.map((notification) => {
                  const iconPath = NOTIFICATION_TYPE_ICONS[notification.type] || DEFAULT_ICON_PATH;
                  return (
                    <button
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                        !notification.isRead ? 'bg-indigo-50/50' : ''
                      }`}
                    >
                      {/* Type icon */}
                      <div
                        className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                          !notification.isRead
                            ? 'bg-indigo-100 text-indigo-600'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d={iconPath}
                          />
                        </svg>
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm ${
                            !notification.isRead
                              ? 'font-medium text-gray-900'
                              : 'text-gray-700'
                          }`}
                        >
                          {notification.title}
                        </p>
                        {notification.data.issueKey ? (
                          <p className="mt-0.5 text-xs text-indigo-600">
                            {String(notification.data.issueKey)}
                          </p>
                        ) : null}
                        <p className="mt-0.5 text-xs text-gray-400">
                          {timeAgo(notification.createdAt)}
                        </p>
                      </div>

                      {/* Unread dot */}
                      {!notification.isRead && (
                        <div className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-indigo-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications && notifications.meta.total > 20 && (
            <div className="border-t border-gray-200 px-4 py-2 text-center">
              <a
                href="/notifications"
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
              >
                View all notifications
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
