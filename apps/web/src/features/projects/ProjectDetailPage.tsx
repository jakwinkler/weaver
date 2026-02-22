import { useParams, Link } from 'react-router-dom';
import { useProject, useProjectIssues } from '@/api';
import { Settings as SettingsIcon } from 'lucide-react';

export function ProjectDetailPage() {
  const { projectKey } = useParams<{ projectKey: string }>();
  const { data: project, isLoading: projectLoading } = useProject(projectKey!);
  const { data: issuesData, isLoading: issuesLoading } = useProjectIssues({
    projectKey: projectKey!,
  });

  if (projectLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Loading project...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Project not found.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="rounded bg-indigo-100 px-2 py-1 text-sm font-semibold text-indigo-700">
              {project.key}
            </span>
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          </div>
          <Link
            to={`/projects/${project.key}/settings`}
            className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            <SettingsIcon className="h-4 w-4" />
            Settings
          </Link>
        </div>
        {project.description && (
          <p className="mt-2 text-gray-600">{project.description}</p>
        )}
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Total Issues</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{project.issueCounter}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Created</p>
          <p className="mt-1 text-sm font-medium text-gray-900">
            {new Date(project.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Last Updated</p>
          <p className="mt-1 text-sm font-medium text-gray-900">
            {new Date(project.updatedAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Recent Issues</h2>
        <Link
          to={`/projects/${project.key}/issues`}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          View all issues
        </Link>
      </div>

      {issuesLoading ? (
        <p className="mt-4 text-gray-500">Loading issues...</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {issuesData?.data.slice(0, 10).map((issue) => (
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
                </tr>
              ))}
              {issuesData?.data.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-sm text-gray-500">
                    No issues yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
