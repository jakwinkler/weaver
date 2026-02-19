import { useState, type FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useProject } from '@/api';
import {
  useSprints,
  useCreateSprint,
  useStartSprint,
  useCompleteSprint,
} from '@/api/hooks-phase2';
import type { Sprint, SprintStatus } from '@weaver/shared';

function SprintStatusBadge({ status }: { status: SprintStatus }) {
  const colors: Record<SprintStatus, string> = {
    planned: 'bg-blue-100 text-blue-700',
    active: 'bg-green-100 text-green-700',
    completed: 'bg-gray-100 text-gray-600',
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status]}`}
    >
      {status}
    </span>
  );
}

function formatDate(date: Date | string | undefined): string {
  if (!date) return '--';
  return new Date(date).toLocaleDateString();
}

function SprintActions({ sprint }: { sprint: Sprint }) {
  const startSprint = useStartSprint(sprint.id);
  const completeSprint = useCompleteSprint(sprint.id);

  if (sprint.status === 'planned') {
    return (
      <button
        onClick={() => startSprint.mutate()}
        disabled={startSprint.isPending}
        className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        {startSprint.isPending ? 'Starting...' : 'Start Sprint'}
      </button>
    );
  }

  if (sprint.status === 'active') {
    return (
      <button
        onClick={() => completeSprint.mutate()}
        disabled={completeSprint.isPending}
        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {completeSprint.isPending ? 'Completing...' : 'Complete Sprint'}
      </button>
    );
  }

  return null;
}

function CreateSprintForm({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const createSprint = useCreateSprint(projectId);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await createSprint.mutateAsync({
      name,
      goal: goal || undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
    setName('');
    setGoal('');
    setStartDate('');
    setEndDate('');
    onCreated();
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Create Sprint</h3>
      <div className="space-y-3">
        <div>
          <label htmlFor="sprintName" className="block text-sm font-medium text-gray-700">
            Name
          </label>
          <input
            id="sprintName"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sprint 1"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="sprintGoal" className="block text-sm font-medium text-gray-700">
            Goal (optional)
          </label>
          <input
            id="sprintGoal"
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="What should this sprint achieve?"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="sprintStart" className="block text-sm font-medium text-gray-700">
              Start Date
            </label>
            <input
              id="sprintStart"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="sprintEnd" className="block text-sm font-medium text-gray-700">
              End Date
            </label>
            <input
              id="sprintEnd"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
        {createSprint.isError && (
          <p className="text-sm text-red-600">Failed to create sprint.</p>
        )}
        <button
          type="submit"
          disabled={createSprint.isPending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {createSprint.isPending ? 'Creating...' : 'Create Sprint'}
        </button>
      </div>
    </form>
  );
}

export function SprintBoard() {
  const { projectKey } = useParams<{ projectKey: string }>();
  const { data: project, isLoading: projectLoading } = useProject(projectKey!);
  const {
    data: sprints,
    isLoading: sprintsLoading,
    refetch: refetchSprints,
  } = useSprints(project?.id || '');

  const [showCreateForm, setShowCreateForm] = useState(false);

  const isLoading = projectLoading || sprintsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Loading sprints...</p>
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

  const activeSprint = sprints?.find((s) => s.status === 'active');
  const sortedSprints = [...(sprints || [])].sort((a, b) => {
    const order: Record<string, number> = { active: 0, planned: 1, completed: 2 };
    return (order[a.status] ?? 1) - (order[b.status] ?? 1);
  });

  return (
    <div>
      <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
        <Link to={`/projects/${projectKey}`} className="hover:text-indigo-600">
          {projectKey}
        </Link>
        <span>/</span>
        <span className="text-gray-900">Sprints</span>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Sprints</h1>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          {showCreateForm ? 'Cancel' : 'New Sprint'}
        </button>
      </div>

      {showCreateForm && (
        <div className="mb-6">
          <CreateSprintForm
            projectId={project.id}
            onCreated={() => {
              refetchSprints();
              setShowCreateForm(false);
            }}
          />
        </div>
      )}

      {/* Active sprint highlight */}
      {activeSprint && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">{activeSprint.name}</h2>
                <SprintStatusBadge status={activeSprint.status} />
              </div>
              {activeSprint.goal && (
                <p className="mt-1 text-sm text-gray-600">{activeSprint.goal}</p>
              )}
              <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                <span>Start: {formatDate(activeSprint.startDate)}</span>
                <span>End: {formatDate(activeSprint.endDate)}</span>
              </div>
            </div>
            <SprintActions sprint={activeSprint} />
          </div>

          {/* Progress bar */}
          {activeSprint.startDate && activeSprint.endDate && (
            <div className="mt-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-green-200">
                <div
                  className="h-full rounded-full bg-green-500 transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        0,
                        ((Date.now() - new Date(activeSprint.startDate).getTime()) /
                          (new Date(activeSprint.endDate).getTime() -
                            new Date(activeSprint.startDate).getTime())) *
                          100,
                      ),
                    )}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {Math.max(
                  0,
                  Math.ceil(
                    (new Date(activeSprint.endDate).getTime() - Date.now()) /
                      (1000 * 60 * 60 * 24),
                  ),
                )}{' '}
                days remaining
              </p>
            </div>
          )}
        </div>
      )}

      {/* Sprint list */}
      <div className="space-y-3">
        {sortedSprints.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-500">No sprints yet. Create one to get started.</p>
          </div>
        )}

        {sortedSprints.map((sprint) => (
          <div
            key={sprint.id}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4"
          >
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900">{sprint.name}</h3>
                <SprintStatusBadge status={sprint.status} />
              </div>
              {sprint.goal && (
                <p className="mt-0.5 text-sm text-gray-500">{sprint.goal}</p>
              )}
              <div className="mt-1 flex items-center gap-4 text-xs text-gray-400">
                <span>Start: {formatDate(sprint.startDate)}</span>
                <span>End: {formatDate(sprint.endDate)}</span>
              </div>
            </div>
            <SprintActions sprint={sprint} />
          </div>
        ))}
      </div>
    </div>
  );
}
