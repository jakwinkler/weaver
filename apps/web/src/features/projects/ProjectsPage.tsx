import { useState, useCallback, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useProjects, useCreateProject } from '@/api';
import { RichTextEditor, serializeDoc } from '@/components/RichTextEditor';
import { ProjectIcon } from './ProjectSettingsPage';

export function ProjectsPage() {
  const { data, isLoading } = useProjects();
  const createProject = useCreateProject();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [descJson, setDescJson] = useState<Record<string, unknown> | null>(null);

  const handleDescChange = useCallback((json: Record<string, unknown>) => {
    setDescJson(json);
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const descStr = serializeDoc(descJson);
    await createProject.mutateAsync({
      name,
      key,
      description: descStr || undefined,
    });
    setName('');
    setKey('');
    setDescJson(null);
    setShowForm(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Loading projects...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          {showForm ? 'Cancel' : 'Create Project'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="projectName" className="block text-sm font-medium text-gray-700">
                Name
              </label>
              <input
                id="projectName"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="My Project"
              />
            </div>
            <div>
              <label htmlFor="projectKey" className="block text-sm font-medium text-gray-700">
                Key
              </label>
              <input
                id="projectKey"
                type="text"
                required
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="PROJ"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Description
            </label>
            <RichTextEditor
              content={descJson}
              onChange={handleDescChange}
              placeholder="Optional description"
            />
          </div>
          {createProject.isError && (
            <p className="mt-2 text-sm text-red-600">Failed to create project.</p>
          )}
          <div className="mt-4">
            <button
              type="submit"
              disabled={createProject.isPending}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {createProject.isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Project
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Issues
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data?.data.map((project) => (
              <tr key={project.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-6 py-4">
                  <Link to={`/projects/${project.key}`} className="flex items-center gap-3">
                    <ProjectIcon iconAttachmentId={project.iconAttachmentId} projectKey={project.key} size="sm" />
                    <div>
                      <span className="text-sm font-medium text-indigo-600">{project.key}</span>
                      <span className="ml-2 text-sm text-gray-900">{project.name}</span>
                    </div>
                  </Link>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {project.description || '-'}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                  {project.issueCounter}
                </td>
              </tr>
            ))}
            {data?.data.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-sm text-gray-500">
                  No projects yet. Create your first project to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
