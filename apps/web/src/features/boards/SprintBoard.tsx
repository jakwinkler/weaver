import { useState, type FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQueryClient } from '@tanstack/react-query';
import { GripVertical } from 'lucide-react';
import {
  useProject,
  useProjectIssues,
  useProjectPlugins,
  useHasPermission,
  useUpdateIssueDynamic,
  useReorderIssues,
} from '@/api';
import { FeatureNotEnabled } from './FeatureNotEnabled';
import { useSprints, useCreateSprint, useStartSprint, useCompleteSprint } from '@/api/hooks-phase2';
import type { Issue, Sprint, SprintStatus } from '@weaver/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { buildReorderPayload, moveIssueBetweenGroups } from '@/features/issues/dragAndDrop';

const BACKLOG_ID = 'backlog';

function SprintStatusBadge({ status }: { status: SprintStatus }) {
  const variants: Record<SprintStatus, string> = {
    planned:
      'border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300',
    active:
      'border-green-200 bg-green-100 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300',
    completed: 'border-border bg-muted text-muted-foreground',
  };

  return (
    <Badge className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', variants[status])}>
      {status}
    </Badge>
  );
}

function formatDate(date: Date | string | undefined): string {
  if (!date) return '--';
  return new Date(date).toLocaleDateString();
}

function SprintActions({ sprint }: { sprint: Sprint }) {
  const startSprint = useStartSprint(sprint.id);
  const completeSprint = useCompleteSprint(sprint.id);
  const canManage = useHasPermission('sprints.manage');

  if (!canManage) return null;

  if (sprint.status === 'planned') {
    return (
      <Button
        size="sm"
        onClick={() => startSprint.mutate()}
        disabled={startSprint.isPending}
        className="bg-green-600 text-xs hover:bg-green-700"
      >
        {startSprint.isPending ? 'Starting...' : 'Start Sprint'}
      </Button>
    );
  }

  if (sprint.status === 'active') {
    return (
      <Button
        size="sm"
        onClick={() => completeSprint.mutate()}
        disabled={completeSprint.isPending}
        className="text-xs"
      >
        {completeSprint.isPending ? 'Completing...' : 'Complete Sprint'}
      </Button>
    );
  }

  return null;
}

function CreateSprintForm({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [capacity, setCapacity] = useState('');
  const createSprint = useCreateSprint(projectId);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await createSprint.mutateAsync({
      name,
      goal: goal || undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      capacity: capacity ? Number(capacity) : undefined,
    });
    setName('');
    setGoal('');
    setStartDate('');
    setEndDate('');
    setCapacity('');
    onCreated();
  };

  return (
    <Card>
      <CardHeader className="px-4 pb-3 pt-4">
        <CardTitle className="text-sm">Create Sprint</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sprintName">Name</Label>
            <Input
              id="sprintName"
              type="text"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Sprint 1"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sprintGoal">Goal (optional)</Label>
            <Input
              id="sprintGoal"
              type="text"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="What should this sprint achieve?"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sprintStart">Start Date</Label>
              <Input
                id="sprintStart"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sprintEnd">End Date</Label>
              <Input
                id="sprintEnd"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sprintCapacity">Capacity (story points)</Label>
            <Input
              id="sprintCapacity"
              type="number"
              min="0"
              max="10000"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="Optional"
            />
          </div>
          {createSprint.isError && (
            <p className="text-sm text-destructive">Failed to create sprint.</p>
          )}
          <Button type="submit" disabled={createSprint.isPending}>
            {createSprint.isPending ? 'Creating...' : 'Create Sprint'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PlanningIssueCard({
  issue,
  containerId,
  disabled,
}: {
  issue: Issue;
  containerId: string;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
    data: { type: 'issue', issue, containerId },
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="sprint-issue"
      className={cn(
        'group flex items-center gap-3 border border-border bg-card px-3 py-2.5 shadow-sm transition hover:border-primary/30 hover:shadow-md',
        isDragging && 'opacity-30',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={disabled}
        aria-label={disabled ? `${issue.key} cannot be moved` : `Drag ${issue.key}`}
        className="flex h-8 w-8 shrink-0 cursor-grab items-center justify-center text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-25"
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      <Link to={`/issues/${issue.key}`} className="min-w-0 flex-1">
        <span className="mr-2 text-xs font-semibold text-primary">{issue.key}</span>
        <span className="text-sm text-foreground">{issue.summary}</span>
      </Link>
      {issue.storyPoints !== null && issue.storyPoints !== undefined && (
        <Badge variant="outline" className="shrink-0 rounded-full text-xs font-normal">
          {issue.storyPoints} pt{issue.storyPoints === 1 ? '' : 's'}
        </Badge>
      )}
      <Badge variant="outline" className="shrink-0 rounded-full text-xs font-normal">
        {issue.priority}
      </Badge>
    </div>
  );
}

function SprintProgress({ sprint }: { sprint: Sprint }) {
  if (!sprint.startDate || !sprint.endDate || sprint.status !== 'active') return null;

  const start = new Date(sprint.startDate).getTime();
  const end = new Date(sprint.endDate).getTime();
  const duration = end - start;
  const progress =
    duration > 0 ? Math.min(100, Math.max(0, ((Date.now() - start) / duration) * 100)) : 100;
  const daysRemaining = Math.max(0, Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24)));

  return (
    <div className="mt-3">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-green-200">
        <div
          className="h-full rounded-full bg-green-500 transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{daysRemaining} days remaining</p>
    </div>
  );
}

function SprintPlanningContainer({
  sprint,
  issues,
  isOver,
  canEdit,
}: {
  sprint: Sprint | null;
  issues: Issue[];
  isOver: boolean;
  canEdit: boolean;
}) {
  const containerId = sprint?.id ?? BACKLOG_ID;
  const committedPoints = issues.reduce((total, issue) => total + (issue.storyPoints ?? 0), 0);
  const isCompleted = sprint?.status === 'completed';
  const acceptsDrops = canEdit && !isCompleted;
  const { setNodeRef } = useDroppable({
    id: containerId,
    data: { type: 'container', containerId },
    disabled: !acceptsDrops,
  });

  return (
    <section
      ref={setNodeRef}
      aria-label={sprint?.name ?? 'Backlog'}
      data-testid={`sprint-container-${containerId}`}
      className={cn(
        'border bg-card transition-colors duration-200 motion-reduce:transition-none',
        sprint?.status === 'active' ? 'border-green-300 dark:border-green-800' : 'border-border',
        isOver && acceptsDrops && 'border-primary bg-primary/5 ring-2 ring-primary/20',
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">{sprint?.name ?? 'Backlog'}</h2>
            {sprint && <SprintStatusBadge status={sprint.status} />}
            <span className="text-xs text-muted-foreground">
              {issues.length} issue{issues.length === 1 ? '' : 's'}
            </span>
            {sprint && (
              <span className="text-xs font-medium text-foreground">
                {sprint.capacity === null || sprint.capacity === undefined
                  ? `${committedPoints} pts committed`
                  : `${committedPoints} / ${sprint.capacity} pts`}
              </span>
            )}
          </div>
          {sprint?.goal && <p className="mt-1 text-sm text-muted-foreground">{sprint.goal}</p>}
          {sprint ? (
            <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
              <span>Start: {formatDate(sprint.startDate)}</span>
              <span>End: {formatDate(sprint.endDate)}</span>
              {isCompleted && <span>Completed sprints are read only</span>}
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Issues not assigned to a sprint. Drop work here to remove it from a sprint.
            </p>
          )}
          {sprint && <SprintProgress sprint={sprint} />}
        </div>
        {sprint && <SprintActions sprint={sprint} />}
      </div>

      <SortableContext
        items={issues.map((issue) => issue.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="min-h-20 space-y-2 bg-muted/20 p-3">
          {issues.map((issue) => (
            <PlanningIssueCard
              key={issue.id}
              issue={issue}
              containerId={containerId}
              disabled={!canEdit || isCompleted}
            />
          ))}
          {issues.length === 0 && (
            <p className="flex min-h-14 items-center justify-center border border-dashed border-border px-3 text-center text-xs text-muted-foreground">
              {acceptsDrops ? 'Drop issues here' : 'No issues'}
            </p>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

export function SprintBoard() {
  const { projectKey } = useParams<{ projectKey: string }>();
  const queryClient = useQueryClient();
  const { data: projectPlugins } = useProjectPlugins(projectKey!);
  const { data: project, isLoading: projectLoading } = useProject(projectKey!);
  const {
    data: sprints,
    isLoading: sprintsLoading,
    refetch: refetchSprints,
  } = useSprints(project?.id || '');
  const { data: issuesData, isLoading: issuesLoading } = useProjectIssues({
    projectKey: projectKey!,
    perPage: 200,
    sort: 'sortOrder',
  });
  const updateIssue = useUpdateIssueDynamic();
  const reorderIssues = useReorderIssues();
  const canEditIssues = useHasPermission('issues.update');
  const canCreateSprint = useHasPermission('sprints.create');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const [overContainerId, setOverContainerId] = useState<string | null>(null);
  const [localIssues, setLocalIssues] = useState<Issue[] | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (
    projectPlugins &&
    !projectPlugins.some((plugin) => plugin.pluginId === '@weaver/plugin-sprints')
  ) {
    return <FeatureNotEnabled featureName="Sprints" projectKey={projectKey!} />;
  }

  const isLoading = projectLoading || sprintsLoading || issuesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading sprint plan...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Project not found.</p>
      </div>
    );
  }

  const issues = localIssues ?? issuesData?.data ?? [];
  const sortedSprints = [...(sprints || [])].sort((a, b) => {
    const order: Record<string, number> = { active: 0, planned: 1, completed: 2 };
    const statusDifference = (order[a.status] ?? 1) - (order[b.status] ?? 1);
    if (statusDifference !== 0) return statusDifference;
    return (
      new Date(a.startDate ?? a.createdAt).getTime() -
      new Date(b.startDate ?? b.createdAt).getTime()
    );
  });
  const completedSprintIds = new Set(
    sortedSprints.filter((sprint) => sprint.status === 'completed').map((sprint) => sprint.id),
  );

  const issuesForSprint = (sprintId: string | null) =>
    issues
      .filter((issue) => (issue.sprintId ?? null) === sprintId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

  const resolveContainerId = (event: DragOverEvent | DragEndEvent) => {
    if (!event.over) return null;
    return (
      (event.over.data.current?.containerId as string | undefined) ?? (event.over.id as string)
    );
  };

  const handleDragStart = (event: DragStartEvent) => {
    const issue = event.active.data.current?.issue as Issue | undefined;
    setMoveError(null);
    setActiveIssue(issue ?? null);
    setLocalIssues([...issues]);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const containerId = resolveContainerId(event);
    setOverContainerId(containerId && !completedSprintIds.has(containerId) ? containerId : null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveIssue(null);
    setOverContainerId(null);

    const containerId = resolveContainerId(event);
    if (!event.over || !containerId || completedSprintIds.has(containerId)) {
      setLocalIssues(null);
      return;
    }

    const draggedIssue = issues.find((issue) => issue.id === event.active.id);
    const targetSprintId = containerId === BACKLOG_ID ? null : containerId;
    if (!draggedIssue) {
      setLocalIssues(null);
      return;
    }

    const result = moveIssueBetweenGroups(issues, {
      activeId: event.active.id as string,
      overId: event.over.id as string,
      targetGroupId: targetSprintId,
      groupField: 'sprintId',
    });
    if (!result.changed || !result.activeIssue) {
      setLocalIssues(null);
      return;
    }

    setLocalIssues(result.issues);

    try {
      if (result.sourceGroupId !== result.targetGroupId) {
        await updateIssue.mutateAsync({
          issueKey: draggedIssue.key,
          sprintId: targetSprintId,
          sortOrder: result.activeIssue.sortOrder,
        });
      }
      const reorderPayload = buildReorderPayload(result.affectedIssues);
      if (reorderPayload.length > 0) {
        await reorderIssues.mutateAsync({ issues: reorderPayload });
      }
    } catch {
      setMoveError(
        'The issue could not be fully saved. The latest server state has been reloaded.',
      );
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['issues', projectKey] });
      setLocalIssues(null);
    }
  };

  const handleDragCancel = () => {
    setActiveIssue(null);
    setOverContainerId(null);
    setLocalIssues(null);
  };

  return (
    <div>
      <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link to={`/projects/${projectKey}`} className="hover:text-primary">
          {projectKey}
        </Link>
        <span>/</span>
        <span className="text-foreground">Sprints</span>
      </div>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Sprint planning</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Drag issues between the backlog and active or planned sprints.
          </p>
        </div>
        {canCreateSprint && (
          <Button
            onClick={() => setShowCreateForm(!showCreateForm)}
            variant={showCreateForm ? 'outline' : 'default'}
          >
            {showCreateForm ? 'Cancel' : 'New Sprint'}
          </Button>
        )}
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

      {moveError && (
        <p
          role="alert"
          className="mb-4 border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {moveError}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="space-y-4" data-testid="sprint-planning-board">
          {sortedSprints.map((sprint) => (
            <SprintPlanningContainer
              key={sprint.id}
              sprint={sprint}
              issues={issuesForSprint(sprint.id)}
              isOver={overContainerId === sprint.id}
              canEdit={canEditIssues}
            />
          ))}

          <SprintPlanningContainer
            sprint={null}
            issues={issuesForSprint(null)}
            isOver={overContainerId === BACKLOG_ID}
            canEdit={canEditIssues}
          />
        </div>

        <DragOverlay>
          {activeIssue ? (
            <div className="flex w-[min(36rem,80vw)] items-center gap-3 border border-primary/40 bg-card px-4 py-3 shadow-lg">
              <GripVertical className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium text-primary">{activeIssue.key}</span>
              <span className="truncate text-sm text-foreground">{activeIssue.summary}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
