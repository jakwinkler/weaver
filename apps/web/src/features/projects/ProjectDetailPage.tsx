import { useState, useCallback } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { useProject, useProjectIssues, useUpdateProject, useMyPermissions } from '@/api';
import { Settings as SettingsIcon, Pencil, X, Check } from 'lucide-react';
import { RichTextEditor, normalizeCommentBody, serializeDoc } from '@/components/RichTextEditor';
import { ProjectIcon } from './ProjectSettingsPage';
import { IssueTypeIcon } from '@/components/IconPicker';

export function ProjectDetailPage() {
  const { projectKey } = useParams<{ projectKey: string }>();
  const { data: project, isLoading: projectLoading } = useProject(projectKey!);
  const { data: issuesData, isLoading: issuesLoading } = useProjectIssues({
    projectKey: projectKey!,
  });
  const updateProject = useUpdateProject();
  const permissions = useMyPermissions();
  const location = useLocation();

  const canEdit =
    permissions.includes('*') || permissions.includes('projects.update');

  const [editingDesc, setEditingDesc] = useState(false);
  const [descJson, setDescJson] = useState<Record<string, unknown> | null>(null);

  const startEditing = useCallback(() => {
    setDescJson(normalizeCommentBody(project?.description || ''));
    setEditingDesc(true);
  }, [project?.description]);

  const cancelEditing = useCallback(() => {
    setEditingDesc(false);
    setDescJson(null);
  }, []);

  const saveDescription = useCallback(async () => {
    if (!project) return;
    const descStr = serializeDoc(descJson);
    await updateProject.mutateAsync({
      key: project.key,
      description: descStr || undefined,
    });
    setEditingDesc(false);
    setDescJson(null);
  }, [descJson, project, updateProject]);

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
            <ProjectIcon iconAttachmentId={project.iconAttachmentId} projectKey={project.key} size="md" />
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

        {/* Description */}
        <div className="mt-3">
          {editingDesc ? (
            <div className="space-y-2">
              <RichTextEditor
                content={descJson}
                onChange={setDescJson}
                placeholder="Add a project description..."
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={saveDescription}
                  disabled={updateProject.isPending}
                  className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  {updateProject.isPending ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={cancelEditing}
                  className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="group relative">
              {project.description ? (
                <div className="rounded-md">
                  <RichTextEditor
                    content={normalizeCommentBody(project.description)}
                    editable={false}
                  />
                </div>
              ) : (
                <p className="text-sm italic text-gray-400">
                  {canEdit ? 'Click the edit icon to add a description.' : 'No description.'}
                </p>
              )}
              {canEdit && (
                <button
                  onClick={startEditing}
                  className="absolute top-0 right-0 rounded-md bg-white p-1.5 text-gray-400 opacity-0 shadow-sm ring-1 ring-gray-200 transition-opacity hover:text-indigo-600 group-hover:opacity-100"
                  title="Edit description"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* View navigation */}
      <ProjectViewNav projectKey={project.key} currentPath={location.pathname} />

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
                  Type
                </th>
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
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {issue.issueType ? (
                      <span className="inline-flex items-center gap-1.5" title={issue.issueType.name}>
                        <IssueTypeIcon
                          icon={issue.issueType.icon}
                          iconColor={issue.issueType.iconColor}
                          iconAttachmentId={issue.issueType.iconAttachmentId}
                        />
                      </span>
                    ) : '—'}
                  </td>
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
                  <td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-500">
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

const VIEW_LINKS = [
  { label: 'Issues', path: 'issues' },
  { label: 'Board', path: 'board' },
  { label: 'Sprints', path: 'sprints' },
  { label: 'Gantt', path: 'gantt' },
  { label: 'Calendar', path: 'calendar' },
];

function ProjectViewNav({ projectKey, currentPath }: { projectKey: string; currentPath: string }) {
  return (
    <nav className="mb-6 flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
      {VIEW_LINKS.map(({ label, path }) => {
        const href = `/projects/${projectKey}/${path}`;
        const isActive = currentPath === href;
        return (
          <Link
            key={path}
            to={href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-indigo-100 text-indigo-700'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
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
