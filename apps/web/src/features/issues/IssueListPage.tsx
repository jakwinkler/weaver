import { useState, type FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useProjectIssues, useCreateIssue, useProject } from '@/api';
import type { IssuePriority } from '@weaver/shared';

export function IssueListPage() {
  const { projectKey } = useParams<{ projectKey: string }>();
  const { data: project } = useProject(projectKey!);
  const { data, isLoading } = useProjectIssues({ projectKey: projectKey! });
  const createIssue = useCreateIssue(projectKey!);

  const [showForm, setShowForm] = useState(false);
  const [summary, setSummary] = useState('');
  const [priority, setPriority] = useState<IssuePriority>('medium');

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    await createIssue.mutateAsync({ summary, priority, labels: [], customFields: {} });
    setSummary('');
    setPriority('medium');
    setShowForm(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Loading issues...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link to={`/projects/${projectKey}`} className="hover:text-indigo-600">
              {project?.name || projectKey}
            </Link>
            <span>/</span>
            <span>Issues</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Issues</h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          {showForm ? 'Cancel' : 'Create Issue'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label htmlFor="issueSummary" className="block text-sm font-medium text-gray-700">
                Summary
              </label>
              <input
                id="issueSummary"
                type="text"
                required
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="Issue summary"
              />
            </div>
            <div>
              <label htmlFor="issuePriority" className="block text-sm font-medium text-gray-700">
                Priority
              </label>
              <select
                id="issuePriority"
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
          </div>
          {createIssue.isError && (
            <p className="mt-2 text-sm text-red-600">Failed to create issue.</p>
          )}
          <div className="mt-4">
            <button
              type="submit"
              disabled={createIssue.isPending}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {createIssue.isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Key
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Summary
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Priority
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data?.data.map((issue) => (
              <tr key={issue.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-indigo-600">
                  <Link to={`/issues/${issue.key}`}>{issue.key}</Link>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  <Link to={`/issues/${issue.key}`}>{issue.summary}</Link>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <PriorityBadge priority={issue.priority} />
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                  {issue.statusId}
                </td>
              </tr>
            ))}
            {data?.data.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-500">
                  No issues yet. Create your first issue to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.meta.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>
            Showing {data.data.length} of {data.meta.total} issues
          </span>
          <span>
            Page {data.meta.page} of {data.meta.totalPages}
          </span>
        </div>
      )}
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
