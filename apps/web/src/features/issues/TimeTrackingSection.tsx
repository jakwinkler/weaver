import { useState, type FormEvent } from 'react';
import {
  useTimeEntries,
  useTimeEntrySummary,
  useCreateTimeEntry,
} from '@/api/hooks-phase3';
import { apiClient } from '@/api/client';
import { useQueryClient } from '@tanstack/react-query';

interface TimeTrackingSectionProps {
  issueKey: string;
}

function formatTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

export function TimeTrackingSection({ issueKey }: TimeTrackingSectionProps) {
  const { data: entries, isLoading: entriesLoading } = useTimeEntries(issueKey);
  const { data: summary } = useTimeEntrySummary(issueKey);
  const createEntry = useCreateTimeEntry(issueKey);
  const queryClient = useQueryClient();

  const [minutes, setMinutes] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const mins = parseInt(minutes, 10);
    if (!mins || mins < 1) return;

    await createEntry.mutateAsync({
      minutes: mins,
      description: description.trim() || undefined,
    });
    setMinutes('');
    setDescription('');
  };

  const handleDelete = async (entryId: string) => {
    try {
      await apiClient.delete(`/issues/${issueKey}/time-entries/${entryId}`);
      queryClient.invalidateQueries({ queryKey: ['timeEntries', issueKey] });
      queryClient.invalidateQueries({ queryKey: ['timeEntrySummary', issueKey] });
    } catch {
      // Error handling could be improved with a toast notification
    }
  };

  if (entriesLoading) {
    return (
      <div className="py-4">
        <p className="text-sm text-gray-500">Loading time entries...</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Time Tracking</h2>
        {summary && (
          <div className="rounded-md bg-indigo-50 px-3 py-1">
            <span className="text-sm font-medium text-indigo-700">
              Total: {formatTime(summary.totalMinutes)}
            </span>
          </div>
        )}
      </div>

      {/* Log time form */}
      <form onSubmit={handleSubmit} className="mb-6 rounded-lg bg-gray-50 p-4">
        <h3 className="mb-3 text-sm font-medium text-gray-700">Log Time</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label htmlFor="timeMinutes" className="sr-only">
              Minutes
            </label>
            <input
              id="timeMinutes"
              type="number"
              min="1"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="Minutes"
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="timeDescription" className="sr-only">
              Description
            </label>
            <textarea
              id="timeDescription"
              rows={1}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you work on?"
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <button
              type="submit"
              disabled={createEntry.isPending || !minutes}
              className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {createEntry.isPending ? 'Logging...' : 'Log Time'}
            </button>
          </div>
        </div>
        {createEntry.isError && (
          <p className="mt-2 text-sm text-red-600">Failed to log time entry.</p>
        )}
      </form>

      {/* Time entries list */}
      <div className="space-y-2">
        {(!entries || entries.length === 0) && (
          <p className="py-4 text-center text-sm text-gray-400">
            No time entries logged yet.
          </p>
        )}

        {entries?.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
          >
            <div className="flex items-center gap-4">
              <span className="inline-flex rounded-md bg-indigo-100 px-2.5 py-1 text-sm font-semibold text-indigo-700">
                {formatTime(entry.minutes)}
              </span>
              <div>
                {entry.description && (
                  <p className="text-sm text-gray-700">{entry.description}</p>
                )}
                <p className="text-xs text-gray-400">
                  {new Date(entry.loggedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleDelete(entry.id)}
              className="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-600"
              title="Delete entry"
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
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
