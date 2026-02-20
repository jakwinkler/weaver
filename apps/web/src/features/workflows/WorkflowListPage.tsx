import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWorkflows, useCreateWorkflow, useDeleteWorkflow } from '@/api';
import { Plus, Trash2, GitBranch } from 'lucide-react';

export function WorkflowListPage() {
  const navigate = useNavigate();
  const { data: workflows, isLoading } = useWorkflows();
  const createWorkflow = useCreateWorkflow();
  const deleteWorkflow = useDeleteWorkflow();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const wf = await createWorkflow.mutateAsync({ name, isDefault: false });
    setName('');
    setShowForm(false);
    navigate(`/workflows/${wf.id}`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this workflow? This cannot be undone.')) return;
    await deleteWorkflow.mutateAsync(id);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-12 text-gray-500">Loading workflows...</div>;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
          <p className="mt-1 text-sm text-gray-500">
            Define statuses and transitions for your issues.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          New Workflow
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">Workflow Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Software Development"
                required
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={createWorkflow.isPending}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {createWorkflow.isPending ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {!workflows || workflows.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
          <GitBranch className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-2 text-sm font-medium text-gray-900">No workflows yet</p>
          <p className="mt-1 text-sm text-gray-500">Create your first workflow to define issue statuses.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Default</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Created</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {workflows.map((wf) => (
                <tr key={wf.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      to={`/workflows/${wf.id}`}
                      className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      {wf.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {(wf as any).isDefault && (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                        Default
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(wf.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(wf.id)}
                      disabled={deleteWorkflow.isPending}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      title="Delete workflow"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
