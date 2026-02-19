import { useState, type FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWorkflow } from '@/api/hooks-phase2';
import { apiClient } from '@/api/client';
import { useQueryClient } from '@tanstack/react-query';
import type { StatusCategory, WorkflowStatus, WorkflowTransition } from '@weaver/shared';

const CATEGORY_COLORS: Record<StatusCategory, { bg: string; text: string; border: string; label: string }> = {
  todo: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300', label: 'To Do' },
  in_progress: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300', label: 'In Progress' },
  done: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300', label: 'Done' },
};

function StatusNode({
  status,
  onDelete,
}: {
  status: WorkflowStatus;
  onDelete: () => void;
}) {
  const cat = CATEGORY_COLORS[status.category];

  return (
    <div
      className={`relative rounded-lg border-2 ${cat.border} ${cat.bg} p-3`}
      style={{ borderLeftColor: status.color, borderLeftWidth: '4px' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className={`text-sm font-semibold ${cat.text}`}>{status.name}</h4>
          <span className="text-xs text-gray-500">{cat.label}</span>
        </div>
        <div className="flex items-center gap-1">
          {status.isInitial && (
            <span className="rounded bg-blue-500 px-1.5 py-0.5 text-xs font-medium text-white">
              Initial
            </span>
          )}
          {status.isTerminal && (
            <span className="rounded bg-green-500 px-1.5 py-0.5 text-xs font-medium text-white">
              Terminal
            </span>
          )}
          <button
            onClick={onDelete}
            className="ml-1 rounded p-0.5 text-gray-400 hover:bg-red-100 hover:text-red-600"
            title="Delete status"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <div
        className="mt-1 h-2 w-full rounded"
        style={{ backgroundColor: status.color }}
      />
    </div>
  );
}

function TransitionRow({
  transition,
  statuses,
  onDelete,
}: {
  transition: WorkflowTransition;
  statuses: WorkflowStatus[];
  onDelete: () => void;
}) {
  const fromStatus = statuses.find((s) => s.id === transition.fromStatusId);
  const toStatus = statuses.find((s) => s.id === transition.toStatusId);

  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium text-gray-700">
          {fromStatus?.name || transition.fromStatusId.slice(0, 8)}
        </span>
        <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
        <span className="font-medium text-gray-700">
          {toStatus?.name || transition.toStatusId.slice(0, 8)}
        </span>
        <span className="text-xs text-gray-400">({transition.name})</span>
      </div>
      <button
        onClick={onDelete}
        className="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-600"
        title="Delete transition"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function AddStatusForm({
  workflowId,
  onAdded,
}: {
  workflowId: string;
  onAdded: () => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<StatusCategory>('todo');
  const [color, setColor] = useState('#3B82F6');
  const [isInitial, setIsInitial] = useState(false);
  const [isTerminal, setIsTerminal] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await apiClient.post(`/workflows/${workflowId}/statuses`, {
        name,
        category,
        color,
        isInitial,
        isTerminal,
        position: 0,
      });
      setName('');
      setColor('#3B82F6');
      setIsInitial(false);
      setIsTerminal(false);
      onAdded();
    } catch {
      setError('Failed to add status.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Add Status</h3>
      <div className="space-y-3">
        <div>
          <label htmlFor="statusName" className="block text-sm font-medium text-gray-700">
            Name
          </label>
          <input
            id="statusName"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. In Review"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="statusCategory" className="block text-sm font-medium text-gray-700">
            Category
          </label>
          <select
            id="statusCategory"
            value={category}
            onChange={(e) => setCategory(e.target.value as StatusCategory)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
          </select>
        </div>
        <div>
          <label htmlFor="statusColor" className="block text-sm font-medium text-gray-700">
            Color
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="statusColor"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-8 w-8 cursor-pointer rounded border border-gray-300"
            />
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              pattern="^#[0-9a-fA-F]{6}$"
              className="block w-28 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={isInitial}
              onChange={(e) => setIsInitial(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Initial status
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={isTerminal}
              onChange={(e) => setIsTerminal(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Terminal status
          </label>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? 'Adding...' : 'Add Status'}
        </button>
      </div>
    </form>
  );
}

function AddTransitionForm({
  workflowId,
  statuses,
  onAdded,
}: {
  workflowId: string;
  statuses: WorkflowStatus[];
  onAdded: () => void;
}) {
  const [name, setName] = useState('');
  const [fromStatusId, setFromStatusId] = useState('');
  const [toStatusId, setToStatusId] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await apiClient.post(`/workflows/${workflowId}/transitions`, {
        name,
        fromStatusId,
        toStatusId,
      });
      setName('');
      setFromStatusId('');
      setToStatusId('');
      onAdded();
    } catch {
      setError('Failed to add transition.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Add Transition</h3>
      <div className="space-y-3">
        <div>
          <label htmlFor="transitionName" className="block text-sm font-medium text-gray-700">
            Name
          </label>
          <input
            id="transitionName"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Start Work"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="fromStatus" className="block text-sm font-medium text-gray-700">
            From Status
          </label>
          <select
            id="fromStatus"
            required
            value={fromStatusId}
            onChange={(e) => setFromStatusId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Select status...</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="toStatus" className="block text-sm font-medium text-gray-700">
            To Status
          </label>
          <select
            id="toStatus"
            required
            value={toStatusId}
            onChange={(e) => setToStatusId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Select status...</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !fromStatusId || !toStatusId}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? 'Adding...' : 'Add Transition'}
        </button>
      </div>
    </form>
  );
}

export function WorkflowEditor() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const { data: workflow, isLoading } = useWorkflow(workflowId!);
  const queryClient = useQueryClient();

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
  };

  const handleDeleteStatus = async (statusId: string) => {
    try {
      await apiClient.delete(`/workflows/${workflowId}/statuses/${statusId}`);
      refetch();
    } catch {
      // Error handling could be improved with a toast notification
    }
  };

  const handleDeleteTransition = async (transitionId: string) => {
    try {
      await apiClient.delete(`/workflows/${workflowId}/transitions/${transitionId}`);
      refetch();
    } catch {
      // Error handling could be improved with a toast notification
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Loading workflow...</p>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Workflow not found.</p>
      </div>
    );
  }

  const statuses = workflow.statuses || [];
  const transitions = workflow.transitions || [];

  // Group statuses by category
  const todoStatuses = statuses.filter((s) => s.category === 'todo');
  const inProgressStatuses = statuses.filter((s) => s.category === 'in_progress');
  const doneStatuses = statuses.filter((s) => s.category === 'done');

  return (
    <div>
      <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
        <Link to="/projects" className="hover:text-indigo-600">
          Projects
        </Link>
        <span>/</span>
        <span className="text-gray-900">Workflow: {workflow.name}</span>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{workflow.name}</h1>
          {workflow.isDefault && (
            <span className="mt-1 inline-flex rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
              Default Workflow
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main content - Statuses and Transitions */}
        <div className="col-span-2 space-y-6">
          {/* Statuses visualization */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Statuses</h2>

            <div className="grid grid-cols-3 gap-4">
              {/* To Do column */}
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-700">
                  <div className="h-3 w-3 rounded-full bg-blue-400" />
                  To Do
                </h3>
                <div className="space-y-2">
                  {todoStatuses.map((status) => (
                    <StatusNode
                      key={status.id}
                      status={status}
                      onDelete={() => handleDeleteStatus(status.id)}
                    />
                  ))}
                  {todoStatuses.length === 0 && (
                    <p className="py-2 text-center text-xs text-gray-400">No statuses</p>
                  )}
                </div>
              </div>

              {/* In Progress column */}
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-yellow-700">
                  <div className="h-3 w-3 rounded-full bg-yellow-400" />
                  In Progress
                </h3>
                <div className="space-y-2">
                  {inProgressStatuses.map((status) => (
                    <StatusNode
                      key={status.id}
                      status={status}
                      onDelete={() => handleDeleteStatus(status.id)}
                    />
                  ))}
                  {inProgressStatuses.length === 0 && (
                    <p className="py-2 text-center text-xs text-gray-400">No statuses</p>
                  )}
                </div>
              </div>

              {/* Done column */}
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-green-700">
                  <div className="h-3 w-3 rounded-full bg-green-400" />
                  Done
                </h3>
                <div className="space-y-2">
                  {doneStatuses.map((status) => (
                    <StatusNode
                      key={status.id}
                      status={status}
                      onDelete={() => handleDeleteStatus(status.id)}
                    />
                  ))}
                  {doneStatuses.length === 0 && (
                    <p className="py-2 text-center text-xs text-gray-400">No statuses</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Transitions */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Transitions</h2>
            <div className="space-y-2">
              {transitions.map((transition) => (
                <TransitionRow
                  key={transition.id}
                  transition={transition}
                  statuses={statuses}
                  onDelete={() => handleDeleteTransition(transition.id)}
                />
              ))}
              {transitions.length === 0 && (
                <p className="py-4 text-center text-sm text-gray-400">
                  No transitions defined yet.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar - Forms */}
        <div className="space-y-4">
          <AddStatusForm workflowId={workflowId!} onAdded={refetch} />
          {statuses.length >= 2 && (
            <AddTransitionForm
              workflowId={workflowId!}
              statuses={statuses}
              onAdded={refetch}
            />
          )}
        </div>
      </div>
    </div>
  );
}
