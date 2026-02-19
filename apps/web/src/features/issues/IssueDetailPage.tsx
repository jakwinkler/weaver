import { useState, useEffect, type FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useIssue, useUpdateIssue } from '@/api';
import type { IssuePriority } from '@weaver/shared';

export function IssueDetailPage() {
  const { issueKey } = useParams<{ issueKey: string }>();
  const { data: issue, isLoading } = useIssue(issueKey!);
  const updateIssue = useUpdateIssue(issueKey!);

  const [isEditing, setIsEditing] = useState(false);
  const [summary, setSummary] = useState('');
  const [priority, setPriority] = useState<IssuePriority>('medium');
  const [labels, setLabels] = useState('');

  useEffect(() => {
    if (issue) {
      setSummary(issue.summary);
      setPriority(issue.priority);
      setLabels(issue.labels.join(', '));
    }
  }, [issue]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    await updateIssue.mutateAsync({
      summary,
      priority,
      labels: labels
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean),
    });
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Loading issue...</p>
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Issue not found.</p>
      </div>
    );
  }

  const projectKey = issue.key.split('-')[0];

  return (
    <div>
      <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
        <Link to={`/projects/${projectKey}`} className="hover:text-indigo-600">
          {projectKey}
        </Link>
        <span>/</span>
        <Link to={`/projects/${projectKey}/issues`} className="hover:text-indigo-600">
          Issues
        </Link>
        <span>/</span>
        <span className="text-gray-900">{issue.key}</span>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main content */}
        <div className="col-span-2">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-xl font-bold text-gray-900">
                <span className="mr-2 text-indigo-600">{issue.key}</span>
                {isEditing ? null : issue.summary}
              </h1>
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                {isEditing ? 'Cancel' : 'Edit'}
              </button>
            </div>

            {isEditing ? (
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label htmlFor="editSummary" className="block text-sm font-medium text-gray-700">
                    Summary
                  </label>
                  <input
                    id="editSummary"
                    type="text"
                    required
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label htmlFor="editPriority" className="block text-sm font-medium text-gray-700">
                    Priority
                  </label>
                  <select
                    id="editPriority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as IssuePriority)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="lowest">Lowest</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="highest">Highest</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="editLabels" className="block text-sm font-medium text-gray-700">
                    Labels (comma-separated)
                  </label>
                  <input
                    id="editLabels"
                    type="text"
                    value={labels}
                    onChange={(e) => setLabels(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="bug, frontend, urgent"
                  />
                </div>

                {updateIssue.isError && (
                  <p className="text-sm text-red-600">Failed to update issue.</p>
                )}

                <button
                  type="submit"
                  disabled={updateIssue.isPending}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {updateIssue.isPending ? 'Saving...' : 'Save changes'}
                </button>
              </form>
            ) : (
              <div>
                {issue.description && (
                  <div className="prose prose-sm mt-4 text-gray-700">
                    <pre className="whitespace-pre-wrap text-sm">
                      {JSON.stringify(issue.description, null, 2)}
                    </pre>
                  </div>
                )}
                {!issue.description && (
                  <p className="mt-4 text-sm italic text-gray-400">No description provided.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar details */}
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Details</h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-gray-500">Priority</dt>
                <dd className="mt-0.5">
                  <PriorityBadge priority={issue.priority} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Status ID</dt>
                <dd className="mt-0.5 text-sm text-gray-900">{issue.statusId}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Reporter</dt>
                <dd className="mt-0.5 text-sm text-gray-900">{issue.reporterId}</dd>
              </div>
              {issue.assigneeId && (
                <div>
                  <dt className="text-xs text-gray-500">Assignee</dt>
                  <dd className="mt-0.5 text-sm text-gray-900">{issue.assigneeId}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-gray-500">Labels</dt>
                <dd className="mt-0.5">
                  {issue.labels.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {issue.labels.map((label) => (
                        <span
                          key={label}
                          className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">None</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Created</dt>
                <dd className="mt-0.5 text-sm text-gray-900">
                  {new Date(issue.createdAt).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Updated</dt>
                <dd className="mt-0.5 text-sm text-gray-900">
                  {new Date(issue.updatedAt).toLocaleString()}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    highest: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-blue-100 text-blue-700',
    lowest: 'bg-gray-100 text-gray-700',
  };

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[priority] || 'bg-gray-100 text-gray-700'}`}>
      {priority}
    </span>
  );
}
