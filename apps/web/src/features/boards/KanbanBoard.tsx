import { useState, type FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useProject, useProjectIssues, useWorkflow } from '@/api';
import { useBoards, useCreateBoard } from '@/api/hooks-phase2';
import type { Issue } from '@weaver/shared';

interface StatusColumn {
  statusId: string;
  name: string;
  color: string;
  issues: Issue[];
  position: number;
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
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[priority] || 'bg-gray-100 text-gray-700'}`}
    >
      {priority}
    </span>
  );
}

function IssueCard({ issue }: { issue: Issue }) {
  return (
    <Link
      to={`/issues/${issue.key}`}
      className="block rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition hover:shadow-md"
    >
      <p className="text-sm font-medium text-gray-900">{issue.summary}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs font-medium text-indigo-600">{issue.key}</span>
        <PriorityBadge priority={issue.priority} />
      </div>
      {issue.assigneeId && (
        <div className="mt-2 flex items-center gap-1">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-700">
            {issue.assigneeId.slice(0, 1).toUpperCase()}
          </div>
          <span className="text-xs text-gray-500">{issue.assigneeId.slice(0, 8)}</span>
        </div>
      )}
    </Link>
  );
}

function CreateBoardForm({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const createBoard = useCreateBoard(projectId);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await createBoard.mutateAsync({
      name,
      type: 'kanban',
      config: {},
    });
    setName('');
    onCreated();
  };

  return (
    <div className="mx-auto max-w-md rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Create a Kanban Board</h2>
      <p className="mb-4 text-sm text-gray-500">
        No boards exist for this project yet. Create one to start organizing issues.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="boardName" className="block text-sm font-medium text-gray-700">
            Board Name
          </label>
          <input
            id="boardName"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Development Board"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        {createBoard.isError && (
          <p className="text-sm text-red-600">Failed to create board.</p>
        )}
        <button
          type="submit"
          disabled={createBoard.isPending}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {createBoard.isPending ? 'Creating...' : 'Create Board'}
        </button>
      </form>
    </div>
  );
}

export function KanbanBoard() {
  const { projectKey } = useParams<{ projectKey: string }>();
  const { data: project, isLoading: projectLoading } = useProject(projectKey!);
  const { data: issuesData, isLoading: issuesLoading } = useProjectIssues({
    projectKey: projectKey!,
    perPage: 200,
  });
  const { data: boards, isLoading: boardsLoading, refetch: refetchBoards } = useBoards(
    project?.id || '',
  );
  const { data: workflow } = useWorkflow(project?.workflowId || '');

  const isLoading = projectLoading || issuesLoading || boardsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Loading board...</p>
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

  const hasBoards = boards && boards.length > 0;

  if (!hasBoards) {
    return (
      <div>
        <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
          <Link to={`/projects/${projectKey}`} className="hover:text-indigo-600">
            {projectKey}
          </Link>
          <span>/</span>
          <span className="text-gray-900">Board</span>
        </div>
        <CreateBoardForm projectId={project.id} onCreated={() => refetchBoards()} />
      </div>
    );
  }

  const issues = issuesData?.data || [];
  const statuses = workflow?.statuses || [];

  // Group issues by statusId
  const issuesByStatus = new Map<string, Issue[]>();
  for (const issue of issues) {
    const existing = issuesByStatus.get(issue.statusId) || [];
    existing.push(issue);
    issuesByStatus.set(issue.statusId, existing);
  }

  // Build columns from workflow statuses (ordered by category: to_do, in_progress, done)
  const categoryOrder: Record<string, number> = { to_do: 0, in_progress: 1, done: 2 };
  let columns: StatusColumn[];

  if (statuses.length > 0) {
    columns = statuses
      .map((status) => ({
        statusId: status.id,
        name: status.name,
        color: status.color || '#6b7280',
        issues: issuesByStatus.get(status.id) || [],
        position: categoryOrder[status.category] ?? 1,
      }))
      .sort((a, b) => a.position - b.position);
  } else if (issues.length > 0) {
    // Fallback: create columns from issue statusIds
    columns = Array.from(issuesByStatus.entries()).map(([statusId, columnIssues]) => ({
      statusId,
      name: statusId.slice(0, 8),
      color: '#6b7280',
      issues: columnIssues,
      position: 0,
    }));
  } else {
    columns = [
      { statusId: 'todo', name: 'To Do', color: '#6b7280', issues: [], position: 0 },
      { statusId: 'in_progress', name: 'In Progress', color: '#3b82f6', issues: [], position: 1 },
      { statusId: 'done', name: 'Done', color: '#22c55e', issues: [], position: 2 },
    ];
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
        <Link to={`/projects/${projectKey}`} className="hover:text-indigo-600">
          {projectKey}
        </Link>
        <span>/</span>
        <span className="text-gray-900">Board</span>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">
          {boards![0].name}
        </h1>
        <span className="text-sm text-gray-500">
          {issues.length} issue{issues.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((column) => (
          <div
            key={column.statusId}
            className="flex w-72 flex-shrink-0 flex-col rounded-lg bg-gray-50 p-3"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: column.color }}
                />
                <h3 className="text-sm font-semibold text-gray-700">{column.name}</h3>
              </div>
              <span className="inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                {column.issues.length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {column.issues.map((issue) => (
                <IssueCard key={issue.id} issue={issue} />
              ))}
              {column.issues.length === 0 && (
                <p className="py-4 text-center text-xs text-gray-400">No issues</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
