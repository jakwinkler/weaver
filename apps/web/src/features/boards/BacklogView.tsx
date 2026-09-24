import { parseDateOnly } from '@/lib/date-only';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Issue, IssuePriority, Sprint } from '@weaver/shared';
import {
  useBacklog,
  useCreateIssue,
  useHasPermission,
  useIssueTypes,
  useMoveIssueToSprint,
  useProject,
  useProjectIssues,
  useProjectMembers,
  useProjectPlugins,
  useReorderIssues,
} from '@/api';
import { useSprints } from '@/api/hooks-phase2';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { FeatureNotEnabled } from './FeatureNotEnabled';
import {
  matchesBacklogFilters,
  movePlanningIssue,
  planningContainerId,
  type BacklogFilters,
} from './backlogPlanning';
import { PlanningIssueContent, SortablePlanningIssue, SprintContainer } from './SprintContainer';

const PRIORITIES: IssuePriority[] = ['highest', 'high', 'medium', 'low', 'lowest'];

function compareSprints(left: Sprint, right: Sprint): number {
  const statusOrder: Record<string, number> = { active: 0, planned: 1 };
  const statusDifference = (statusOrder[left.status] ?? 2) - (statusOrder[right.status] ?? 2);
  if (statusDifference !== 0) return statusDifference;

  const leftDate = left.startDate ? parseDateOnly(left.startDate).getTime() : Number.MAX_SAFE_INTEGER;
  const rightDate = right.startDate ? parseDateOnly(right.startDate).getTime() : Number.MAX_SAFE_INTEGER;
  return (
    leftDate - rightDate || left.createdAt.toString().localeCompare(right.createdAt.toString())
  );
}

function changedIssueOrder(before: Issue[], after: Issue[]): { id: string; sortOrder: number }[] {
  const previous = new Map(before.map((issue) => [issue.id, issue]));
  return after
    .filter((issue) => {
      const oldIssue = previous.get(issue.id);
      return (
        !oldIssue || oldIssue.sortOrder !== issue.sortOrder || oldIssue.sprintId !== issue.sprintId
      );
    })
    .map((issue) => ({ id: issue.id, sortOrder: issue.sortOrder }));
}

function BacklogDropZone({
  issues,
  canDrag,
  isOver,
}: {
  issues: Issue[];
  canDrag: boolean;
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({
    id: planningContainerId(null),
    disabled: !canDrag,
    data: { type: 'container', sprintId: null },
  });

  return (
    <SortableContext items={issues.map((issue) => issue.id)} strategy={verticalListSortingStrategy}>
      <div
        ref={setNodeRef}
        role="region"
        aria-label="Backlog issue list"
        tabIndex={0}
        className={cn(
          'min-h-20 overflow-hidden rounded-lg border border-border bg-card transition focus:outline-none focus:ring-2 focus:ring-primary/30',
          isOver && 'border-primary ring-2 ring-primary/20',
        )}
      >
        {issues.map((issue) => (
          <SortablePlanningIssue key={issue.id} issue={issue} canDrag={canDrag} />
        ))}
        {issues.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No issues match this backlog view.
          </p>
        )}
      </div>
    </SortableContext>
  );
}

function readCollapsedSprints(projectKey: string): Set<string> {
  try {
    const value = sessionStorage.getItem(`weaver:backlog:collapsed:${projectKey}`);
    return new Set(value ? (JSON.parse(value) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function BacklogView() {
  const { projectKey = '' } = useParams<{ projectKey: string }>();
  const { data: project, isLoading: projectLoading } = useProject(projectKey);
  const { data: projectPlugins } = useProjectPlugins(projectKey);
  const { data: sprints, isLoading: sprintsLoading } = useSprints(project?.id ?? '');
  const { data: allIssues, isLoading: issuesLoading } = useProjectIssues({
    projectKey,
    all: true,
    sort: 'sortOrder',
  });
  const { data: issueTypes } = useIssueTypes();
  const { data: projectMembers } = useProjectMembers(projectKey);
  const [filters, setFilters] = useState<BacklogFilters>({});
  const { data: backlog, isLoading: backlogLoading } = useBacklog({
    projectKey,
    all: true,
    ...filters,
  });
  const createIssue = useCreateIssue(projectKey);
  const moveIssue = useMoveIssueToSprint();
  const reorderIssues = useReorderIssues();
  const canCreate = useHasPermission('issues.create');
  const canPlan = useHasPermission('issues.update');

  const visibleSprints = useMemo(
    () => (sprints ?? []).filter((sprint) => sprint.status !== 'completed').sort(compareSprints),
    [sprints],
  );
  const visibleSprintIds = useMemo(
    () => new Set(visibleSprints.map((sprint) => sprint.id)),
    [visibleSprints],
  );
  const serverIssues = useMemo(() => {
    const assigned = (allIssues?.data ?? []).filter(
      (issue) => issue.sprintId && visibleSprintIds.has(issue.sprintId),
    );
    const byId = new Map([...assigned, ...(backlog?.data ?? [])].map((issue) => [issue.id, issue]));
    return Array.from(byId.values());
  }, [allIssues?.data, backlog?.data, visibleSprintIds]);

  const [localIssues, setLocalIssues] = useState<Issue[]>([]);
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const [overSprintId, setOverSprintId] = useState<string | null | undefined>(undefined);
  const [planningError, setPlanningError] = useState('');
  const [summary, setSummary] = useState('');
  const [storyPoints, setStoryPoints] = useState('');
  const [collapsedSprints, setCollapsedSprints] = useState<Set<string>>(() =>
    readCollapsedSprints(projectKey),
  );
  const dragSnapshot = useRef<Issue[]>([]);

  useEffect(() => {
    setLocalIssues(serverIssues);
  }, [serverIssues]);

  useEffect(() => {
    sessionStorage.setItem(
      `weaver:backlog:collapsed:${projectKey}`,
      JSON.stringify(Array.from(collapsedSprints)),
    );
  }, [collapsedSprints, projectKey]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const resolveTarget = (event: DragOverEvent | DragEndEvent) => {
    const over = event.over;
    if (!over) return undefined;
    if (over.data.current?.type === 'container') {
      return { sprintId: (over.data.current.sprintId as string | null) ?? null };
    }
    const issue = localIssues.find((candidate) => candidate.id === over.id);
    return issue ? { sprintId: issue.sprintId ?? null, overIssueId: issue.id } : undefined;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const issue = event.active.data.current?.issue as Issue | undefined;
    if (!issue) return;
    dragSnapshot.current = localIssues;
    setActiveIssue(issue);
    setPlanningError('');
  };

  const handleDragOver = (event: DragOverEvent) => {
    const target = resolveTarget(event);
    if (!target) return;
    setOverSprintId(target.sprintId);
    setLocalIssues((current) => {
      const dragged = current.find((issue) => issue.id === event.active.id);
      if (!dragged || (dragged.sprintId ?? null) === target.sprintId) return current;
      return movePlanningIssue(current, dragged.id, target.sprintId, target.overIssueId);
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const before = dragSnapshot.current;
    const target = resolveTarget(event);
    const draggedBefore = before.find((issue) => issue.id === event.active.id);
    setActiveIssue(null);
    setOverSprintId(undefined);

    if (!target || !draggedBefore) {
      setLocalIssues(before);
      return;
    }

    const nextForPersistence = movePlanningIssue(
      localIssues,
      draggedBefore.id,
      target.sprintId,
      target.overIssueId,
    );
    const moved = nextForPersistence.find((issue) => issue.id === draggedBefore.id);
    if (!moved) return;

    const nextForDisplay =
      target.sprintId === null && !matchesBacklogFilters(moved, filters)
        ? nextForPersistence.filter((issue) => issue.id !== moved.id)
        : nextForPersistence;
    setLocalIssues(nextForDisplay);

    try {
      await moveIssue.mutateAsync({
        issueKey: moved.key,
        sprintId: target.sprintId,
        sortOrder: moved.sortOrder,
      });
      const orderUpdates = changedIssueOrder(before, nextForPersistence);
      if (orderUpdates.length > 0) {
        await reorderIssues.mutateAsync({ issues: orderUpdates });
      }
    } catch {
      setLocalIssues(before);
      setPlanningError('The issue could not be moved. Your previous sprint plan was restored.');
    }
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!summary.trim()) return;

    try {
      const created = await createIssue.mutateAsync({
        summary: summary.trim(),
        priority: 'medium',
        labels: [],
        customFields: {},
        percentDone: 0,
        ...(storyPoints ? { storyPoints: Number(storyPoints) } : {}),
      });
      if (matchesBacklogFilters(created, filters)) {
        setLocalIssues((current) => [...current, created]);
      }
      setSummary('');
      setStoryPoints('');
    } catch {
      setPlanningError('The issue could not be created.');
    }
  };

  const updateFilter = (key: keyof BacklogFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value || undefined }));
  };

  const toggleSprint = (sprintId: string) => {
    setCollapsedSprints((current) => {
      const next = new Set(current);
      if (next.has(sprintId)) next.delete(sprintId);
      else next.add(sprintId);
      return next;
    });
  };

  if (
    projectPlugins &&
    !projectPlugins.some((plugin) => plugin.pluginId === '@weaver/plugin-sprints')
  ) {
    return <FeatureNotEnabled featureName="Backlog" projectKey={projectKey} />;
  }

  if (projectLoading || sprintsLoading || issuesLoading || backlogLoading) {
    return <p className="py-12 text-center text-muted-foreground">Loading backlog...</p>;
  }

  if (!project) {
    return <p className="py-12 text-center text-muted-foreground">Project not found.</p>;
  }

  const backlogIssues = localIssues
    .filter((issue) => !issue.sprintId)
    .sort((left, right) => left.sortOrder - right.sortOrder);

  return (
    <div className="space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to={`/projects/${projectKey}`} className="hover:text-primary">
            {project.name}
          </Link>
          <span>/</span>
          <span className="text-foreground">Backlog</span>
        </div>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Backlog planning</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Prioritize work and drag issues into active or planned sprints.
            </p>
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            {backlog?.meta.total ?? backlogIssues.length} backlog issue
            {(backlog?.meta.total ?? backlogIssues.length) === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {planningError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {planningError}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setLocalIssues(dragSnapshot.current);
          setActiveIssue(null);
          setOverSprintId(undefined);
        }}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Sprints
            </h2>
            <span className="text-xs text-muted-foreground">
              {visibleSprints.length} active or planned
            </span>
          </div>
          {visibleSprints.map((sprint) => {
            const sprintIssues = localIssues
              .filter((issue) => issue.sprintId === sprint.id)
              .sort((left, right) => left.sortOrder - right.sortOrder);
            return (
              <SprintContainer
                key={sprint.id}
                sprint={sprint}
                issues={sprintIssues}
                collapsed={collapsedSprints.has(sprint.id)}
                isOver={overSprintId === sprint.id}
                canDrag={canPlan}
                onToggle={() => toggleSprint(sprint.id)}
              />
            );
          })}
          {visibleSprints.length === 0 && (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No active or planned sprints. Create one from the Sprints tab.
            </div>
          )}
        </div>

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Backlog</h2>
              <p className="text-sm text-muted-foreground">Issues not assigned to a sprint.</p>
            </div>
            <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-3">
              <div>
                <Label htmlFor="backlog-priority" className="sr-only">
                  Priority
                </Label>
                <select
                  id="backlog-priority"
                  value={filters.priority ?? ''}
                  onChange={(event) => updateFilter('priority', event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">All priorities</option>
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="backlog-assignee" className="sr-only">
                  Assignee
                </Label>
                <select
                  id="backlog-assignee"
                  value={filters.assigneeId ?? ''}
                  onChange={(event) => updateFilter('assigneeId', event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">All assignees</option>
                  <option value="unassigned">Unassigned</option>
                  {(projectMembers ?? []).map((member) => (
                    <option key={member.userId} value={member.userId}>
                      Member {member.userId.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="backlog-type" className="sr-only">
                  Issue type
                </Label>
                <select
                  id="backlog-type"
                  value={filters.issueTypeId ?? ''}
                  onChange={(event) => updateFilter('issueTypeId', event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">All issue types</option>
                  {(issueTypes ?? []).map((issueType) => (
                    <option key={issueType.id} value={issueType.id}>
                      {issueType.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <BacklogDropZone
            issues={backlogIssues}
            canDrag={canPlan}
            isOver={overSprintId === null}
          />

          {canCreate && (
            <form
              onSubmit={handleCreate}
              className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-3 sm:flex-row"
            >
              <Label htmlFor="backlog-create" className="sr-only">
                Create issue
              </Label>
              <Input
                id="backlog-create"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="Create issue, then press Enter"
                className="flex-1 bg-background"
                maxLength={500}
              />
              <Label htmlFor="backlog-points" className="sr-only">
                Story points
              </Label>
              <Input
                id="backlog-points"
                type="number"
                min="0"
                max="100"
                value={storyPoints}
                onChange={(event) => setStoryPoints(event.target.value)}
                placeholder="Points"
                className="w-full bg-background sm:w-24"
              />
              <Button type="submit" disabled={!summary.trim() || createIssue.isPending}>
                {createIssue.isPending ? 'Creating...' : 'Create issue'}
              </Button>
            </form>
          )}
        </section>

        <DragOverlay>
          {activeIssue ? (
            <div className="flex w-[min(42rem,calc(100vw-2rem))] items-center gap-3 rounded-lg border border-primary/40 bg-card px-3 py-2.5 shadow-xl">
              <PlanningIssueContent issue={activeIssue} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
