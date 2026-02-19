import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useProjects, useCreateProject } from '@/api';

export function ProjectsPage() {
  const { data, isLoading } = useProjects();
  const createProject = useCreateProject();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    await createProject.mutateAsync({
      name,
      key,
      description: description || undefined,
    });
    setName('');
    setKey('');
    setDescription('');
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
            <label htmlFor="projectDesc" className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="projectDesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                Key
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Name
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
                <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-indigo-600">
                  <Link to={`/projects/${project.key}`}>{project.key}</Link>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                  <Link to={`/projects/${project.key}`}>{project.name}</Link>
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
                <td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-500">
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
