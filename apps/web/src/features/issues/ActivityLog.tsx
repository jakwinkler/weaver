import { useActivity } from '@/api/hooks-phase2';
import { UserAvatar } from '@/components/UserAvatar';

interface ActivityLogProps {
  issueKey: string;
}

const iconMap: Record<string, { bg: string; path: string }> = {
  created: {
    bg: 'bg-green-100 text-green-600',
    path: 'M12 6v6m0 0v6m0-6h6m-6 0H6',
  },
  updated: {
    bg: 'bg-blue-100 text-blue-600',
    path: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  },
  commented: {
    bg: 'bg-indigo-100 text-indigo-600',
    path: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z',
  },
  transitioned: {
    bg: 'bg-yellow-100 text-yellow-600',
    path: 'M13 7l5 5m0 0l-5 5m5-5H6',
  },
  assigned: {
    bg: 'bg-purple-100 text-purple-600',
    path: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  },
  checklist_item_added: {
    bg: 'bg-teal-100 text-teal-600',
    path: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  },
  checklist_item_completed: {
    bg: 'bg-green-100 text-green-600',
    path: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  },
  checklist_item_reopened: {
    bg: 'bg-orange-100 text-orange-600',
    path: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  },
  checklist_item_updated: {
    bg: 'bg-blue-100 text-blue-600',
    path: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7v4m0 0v-1.5',
  },
  checklist_item_removed: {
    bg: 'bg-red-100 text-red-600',
    path: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9h6',
  },
};

export function ActionIcon({ action }: { action: string }) {
  const icon = iconMap[action] || {
    bg: 'bg-gray-100 text-gray-500',
    path: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  };

  return (
    <div
      className={`flex h-8 w-8 items-center justify-center rounded-full ${icon.bg}`}
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
          d={icon.path}
        />
      </svg>
    </div>
  );
}

const actionLabels: Record<string, string> = {
  checklist_item_added: 'added checklist item',
  checklist_item_completed: 'completed checklist item',
  checklist_item_reopened: 'reopened checklist item',
  checklist_item_updated: 'renamed checklist item',
  checklist_item_removed: 'removed checklist item',
};

function formatAction(action: string): string {
  return actionLabels[action] || action;
}

interface ActivityEntryData {
  id: string;
  userId: string;
  userDisplayName?: string;
  userEmail?: string;
  userAvatarUrl?: string | null;
  action: string;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  createdAt: string | Date;
}

export function ActivityEntryRow({ entry }: { entry: ActivityEntryData }) {
  return (
    <div className="relative flex gap-3 pl-0">
      <div className="relative z-10 flex-shrink-0">
        <UserAvatar
          user={{
            displayName: entry.userDisplayName,
            email: entry.userEmail,
            avatarUrl: entry.userAvatarUrl ?? undefined,
          }}
          size="sm"
        />
      </div>
      <div className="min-w-0 flex-1 pb-2">
        <div className="flex items-baseline justify-between">
          <p className="text-sm text-gray-900">
            <span className="font-medium">{entry.userDisplayName ?? entry.userId.slice(0, 8)}</span>
            {' '}
            <span className="text-gray-600">{formatAction(entry.action)}</span>
            {entry.fieldName && (
              <span className="text-gray-600">
                {' '}
                <span className="font-medium text-gray-700">{entry.fieldName}</span>
              </span>
            )}
          </p>
          <span className="ml-2 flex-shrink-0 text-xs text-gray-400">
            {new Date(entry.createdAt).toLocaleString()}
          </span>
        </div>
        {(entry.oldValue || entry.newValue) && (
          <div className="mt-1 flex items-center gap-2 text-sm">
            {entry.oldValue && (
              <span className="inline-flex rounded bg-red-50 px-2 py-0.5 text-xs text-red-700 line-through">
                {entry.oldValue}
              </span>
            )}
            {entry.oldValue && entry.newValue && (
              <svg className="h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            )}
            {entry.newValue && (
              <span className="inline-flex rounded bg-green-50 px-2 py-0.5 text-xs text-green-700">
                {entry.newValue}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ActivityLog({ issueKey }: ActivityLogProps) {
  const { data: activities, isLoading } = useActivity(issueKey);

  if (isLoading) {
    return (
      <div className="py-4">
        <p className="text-sm text-gray-500">Loading activity...</p>
      </div>
    );
  }

  // Filter out "commented" action — those show in Comments tab
  const filteredActivities = activities?.filter((e) => e.action !== 'commented');

  return (
    <div>
      {(!filteredActivities || filteredActivities.length === 0) && (
        <p className="py-4 text-center text-sm text-gray-400">No activity yet.</p>
      )}

      <div className="relative">
        {filteredActivities && filteredActivities.length > 0 && (
          <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />
        )}
        <div className="space-y-4">
          {filteredActivities?.map((entry) => (
            <ActivityEntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      </div>
    </div>
  );
}
