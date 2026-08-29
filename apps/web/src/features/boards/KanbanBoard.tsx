import { useEffect, useState, type FormEvent } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import {
  useProject,
  useWorkflow,
  useProjectPlugins,
  useUpdateIssueDynamic,
  useReorderIssues,
  useHasPermission,
} from '@/api';
import { FeatureNotEnabled } from './FeatureNotEnabled';
import { useBoardIssues, useBoards, useCreateBoard, useUpdateBoard } from '@/api/hooks-phase2';
import type { BoardConfig, Issue, UpdateIssueDto } from '@weaver/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useHotkeys } from '@/hooks/useHotkeys';
import { getNextBoardIssueId, type BoardKeyboardDirection } from './boardKeyboardNavigation';
import { buildReorderPayload, moveIssueBetweenGroups } from '@/features/issues/dragAndDrop';
import { BoardSettings } from './BoardSettings';
import {
  applySwimlaneValue,
  buildSwimlanes,
  getSwimlaneValue,
  getWipLimitWarning,
  isWipLimitReached,
} from './boardLayout';

interface StatusColumn {
  statusId: string;
  name: string;
  color: string;
  issues: Issue[];
  position: number;
}

interface WorkflowStatus {
  id: string;
  name: string;
  color?: string | null;
  category: string;
}

function buildStatusColumns(issues: Issue[], statuses: WorkflowStatus[]): StatusColumn[] {
  const issuesByStatus = new Map<string, Issue[]>();
  for (const issue of issues) {
    const existing = issuesByStatus.get(issue.statusId) || [];
    existing.push(issue);
    issuesByStatus.set(issue.statusId, existing);
  }

  for (const columnIssues of issuesByStatus.values()) {
    columnIssues.sort((left, right) => left.sortOrder - right.sortOrder);
  }

  const categoryOrder: Record<string, number> = { to_do: 0, in_progress: 1, done: 2 };
  if (statuses.length > 0) {
    return statuses
      .map((status) => ({
        statusId: status.id,
        name: status.name,
        color: status.color || '#6b7280',
        issues: issuesByStatus.get(status.id) || [],
        position: categoryOrder[status.category] ?? 1,
      }))
      .sort((left, right) => left.position - right.position);
  }

  if (issues.length > 0) {
    return Array.from(issuesByStatus.entries()).map(([statusId, columnIssues]) => ({
      statusId,
      name: statusId.slice(0, 8),
      color: '#6b7280',
      issues: columnIssues,
      position: 0,
    }));
  }

  return [
    { statusId: 'todo', name: 'To Do', color: '#6b7280', issues: [], position: 0 },
    { statusId: 'in_progress', name: 'In Progress', color: '#3b82f6', issues: [], position: 1 },
    { statusId: 'done', name: 'Done', color: '#22c55e', issues: [], position: 2 },
  ];
}

function PriorityBadge({ priority }: { priority: string }) {
  const variants: Record<string, string> = {
    highest: 'bg-red-100 text-red-700 border-red-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    low: 'bg-blue-100 text-blue-700 border-blue-200',
    lowest: 'bg-muted text-muted-foreground border-border',
  };

  return (
    <Badge
      className={cn(
        'rounded-full px-2 py-0.5 text-xs font-medium',
        variants[priority] || 'bg-muted text-muted-foreground border-border',
      )}
    >
      {priority}
    </Badge>
  );
}

function IssueCardContent({ issue }: { issue: Issue }) {
  return (
    <>
      <p className="text-sm font-medium text-foreground">{issue.summary}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs font-medium text-primary">{issue.key}</span>
        <PriorityBadge priority={issue.priority} />
      </div>
      {issue.assigneeId && (
        <div className="mt-2 flex items-center gap-1">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
            {issue.assigneeId.slice(0, 1).toUpperCase()}
          </div>
          <span className="text-xs text-muted-foreground">{issue.assigneeId.slice(0, 8)}</span>
        </div>
      )}
    </>
  );
}

function SortableIssueCard({
  issue,
  disabled,
  containerId,
  swimlaneValue,
  isKeyboardFocused,
  onKeyboardFocus,
}: {
  issue: Issue;
  disabled: boolean;
  containerId: string;
  swimlaneValue: string | null;
  isKeyboardFocused: boolean;
  onKeyboardFocus: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
    data: { issue, type: 'issue', containerId, statusId: issue.statusId, swimlaneValue },
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid="kanban-card"
      tabIndex={isKeyboardFocused ? 0 : -1}
      data-board-issue-id={issue.id}
      data-keyboard-active={isKeyboardFocused ? 'true' : 'false'}
      onFocus={onKeyboardFocus}
      className={cn(
        'group relative rounded-lg border border-border bg-card p-3 pr-9 shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        isKeyboardFocused && 'ring-2 ring-primary ring-offset-2',
        isDragging && 'opacity-30',
      )}
    >
      <Link to={`/issues/${issue.key}`}>
        <IssueCardContent issue={issue} />
      </Link>
      {!disabled && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${issue.key}`}
          className="absolute right-2 top-2 flex h-7 w-7 cursor-grab items-center justify-center text-muted-foreground opacity-60 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing group-hover:opacity-100"
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function DroppableColumn({
  column,
  isOver,
  canEdit,
  containerId,
  swimlaneValue,
  totalIssueCount,
  wipLimit,
  focusedIssueId,
  firstIssueId,
  onIssueFocus,
}: {
  column: StatusColumn;
  isOver: boolean;
  canEdit: boolean;
  containerId: string;
  swimlaneValue: string | null;
  totalIssueCount: number;
  wipLimit: number | undefined;
  focusedIssueId: string | null;
  firstIssueId: string | null;
  onIssueFocus: (issueId: string) => void;
}) {
  const wipReached = isWipLimitReached(totalIssueCount, wipLimit);
  const { setNodeRef } = useDroppable({
    id: containerId,
    data: { type: 'column', containerId, statusId: column.statusId, swimlaneValue },
  });

  const issueIds = column.issues.map((i) => i.id);

  return (
    <div
      ref={setNodeRef}
      data-testid="kanban-column"
      data-status-id={column.statusId}
      data-wip-reached={wipReached ? 'true' : 'false'}
      className={cn(
        'flex w-72 flex-shrink-0 flex-col rounded-lg border p-3 transition-colors',
        isOver ? 'bg-primary/10 ring-2 ring-primary/30' : 'bg-muted/50',
        wipReached && 'border-red-300 bg-red-50/70 dark:border-red-900 dark:bg-red-950/20',
        !wipReached && 'border-transparent',
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: column.color }} />
          <h3 className="text-sm font-semibold text-foreground">{column.name}</h3>
        </div>
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
            wipReached
              ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {wipLimit ? `${totalIssueCount}/${wipLimit}` : totalIssueCount}
        </span>
      </div>
      <SortableContext items={issueIds} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-[60px] flex-col gap-2">
          {column.issues.map((issue) => (
            <SortableIssueCard
              key={issue.id}
              issue={issue}
              disabled={!canEdit}
              containerId={containerId}
              swimlaneValue={swimlaneValue}
              isKeyboardFocused={
                focusedIssueId === issue.id || (!focusedIssueId && firstIssueId === issue.id)
              }
              onKeyboardFocus={() => onIssueFocus(issue.id)}
            />
          ))}
          {column.issues.length === 0 && !isOver && (
            <p className="py-4 text-center text-xs text-muted-foreground">No issues</p>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function CreateBoardForm({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
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
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Create a Kanban Board</CardTitle>
        <CardDescription>
          No boards exist for this project yet. Create one to start organizing issues.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="boardName">Board Name</Label>
            <Input
              id="boardName"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Development Board"
            />
          </div>
          {createBoard.isError && (
            <p className="text-sm text-destructive">Failed to create board.</p>
          )}
          <Button type="submit" disabled={createBoard.isPending} className="w-full">
            {createBoard.isPending ? 'Creating...' : 'Create Board'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function KanbanBoard() {
  const { projectKey } = useParams<{ projectKey: string }>();
  const navigate = useNavigate();
  const { data: projectPlugins } = useProjectPlugins(projectKey!);
  const { data: project, isLoading: projectLoading } = useProject(projectKey!);
  const {
    data: boards,
    isLoading: boardsLoading,
    refetch: refetchBoards,
  } = useBoards(project?.id || '');
  const activeBoardId = boards?.[0]?.id ?? '';
  const { data: boardData, isLoading: boardIssuesLoading } = useBoardIssues(activeBoardId);
  const { data: workflow } = useWorkflow(project?.workflowId || '');
  const queryClient = useQueryClient();
  const updateIssue = useUpdateIssueDynamic();
  const reorderIssues = useReorderIssues();
  const updateBoard = useUpdateBoard(activeBoardId, project?.id ?? '');
  const canEdit = useHasPermission('issues.update');
  const canConfigure = useHasPermission('projects.update');

  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const [overContainerId, setOverContainerId] = useState<string | null>(null);
  const [localIssues, setLocalIssues] = useState<Issue[] | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [wipWarning, setWipWarning] = useState<string | null>(null);
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(() => new Set());
  const [focusedIssueId, setFocusedIssueId] = useState<string | null>(null);

  const isLoading = projectLoading || boardsLoading || (!!boards?.length && boardIssuesLoading);
  const hasBoards = Boolean(boards && boards.length > 0);
  const boardEnabled =
    projectPlugins === undefined ||
    projectPlugins.some((plugin) => plugin.pluginId === '@weaver/plugin-board');
  const keyboardIssues = localIssues ?? boardData?.issues ?? [];
  const keyboardStatuses = (workflow?.statuses || []) as WorkflowStatus[];
  const keyboardColumns = buildStatusColumns(keyboardIssues, keyboardStatuses).map((column) => ({
    statusId: column.statusId,
    issueIds: column.issues.map((issue) => issue.id),
  }));
  const firstIssueId =
    keyboardColumns.find((column) => column.issueIds.length > 0)?.issueIds[0] ?? null;
  const issueIds = keyboardIssues.map((issue) => issue.id).join('|');

  const moveKeyboardFocus = (direction: BoardKeyboardDirection) => {
    setFocusedIssueId((current) => getNextBoardIssueId(keyboardColumns, current, direction));
  };

  useHotkeys(
    [
      { keys: 'ArrowUp', handler: () => moveKeyboardFocus('up') },
      { keys: 'ArrowDown', handler: () => moveKeyboardFocus('down') },
      { keys: 'ArrowLeft', handler: () => moveKeyboardFocus('left') },
      { keys: 'ArrowRight', handler: () => moveKeyboardFocus('right') },
      {
        keys: 'Enter',
        handler: () => {
          const focusedIssue = keyboardIssues.find((issue) => issue.id === focusedIssueId);
          if (focusedIssue) navigate(`/issues/${focusedIssue.key}`);
        },
        enabled: Boolean(focusedIssueId),
      },
    ],
    {
      context: 'board',
      enabled: boardEnabled && hasBoards && !isLoading,
    },
  );

  useEffect(() => {
    if (focusedIssueId && !keyboardIssues.some((issue) => issue.id === focusedIssueId)) {
      setFocusedIssueId(null);
      return;
    }
    if (!focusedIssueId) return;

    const card = Array.from(document.querySelectorAll<HTMLElement>('[data-board-issue-id]')).find(
      (element) => element.dataset.boardIssueId === focusedIssueId,
    );
    card?.focus({ preventScroll: true });
    card?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [focusedIssueId, issueIds, keyboardIssues]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );

  if (projectPlugins && !projectPlugins.some((p) => p.pluginId === '@weaver/plugin-board')) {
    return <FeatureNotEnabled featureName="Kanban Board" projectKey={projectKey!} />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading board...</p>
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

  if (!hasBoards) {
    return (
      <div>
        <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Link to={`/projects/${projectKey}`} className="hover:text-primary">
            {projectKey}
          </Link>
          <span>/</span>
          <span className="text-foreground">Board</span>
        </div>
        <CreateBoardForm projectId={project.id} onCreated={() => refetchBoards()} />
      </div>
    );
  }

  const board = boardData?.board ?? boards[0];
  const issues = localIssues ?? boardData?.issues ?? [];
  const statuses = (workflow?.statuses || []) as WorkflowStatus[];
  const swimlaneField = board.config.swimlaneField ?? 'none';
  const wipLimits = board.config.wipLimits ?? {};

  const categoryOrder: Record<string, number> = { to_do: 0, in_progress: 1, done: 2 };
  const buildColumns = (columnIssues: Issue[]): StatusColumn[] => {
    const issuesByStatus = new Map<string, Issue[]>();
    for (const issue of columnIssues) {
      const existing = issuesByStatus.get(issue.statusId) || [];
      existing.push(issue);
      issuesByStatus.set(issue.statusId, existing);
    }
    for (const groupedIssues of issuesByStatus.values()) {
      groupedIssues.sort((left, right) => left.sortOrder - right.sortOrder);
    }

    if (statuses.length > 0) {
      return statuses
        .map((status) => ({
          statusId: status.id,
          name: status.name,
          color: status.color || '#6b7280',
          issues: issuesByStatus.get(status.id) || [],
          position: categoryOrder[status.category] ?? 1,
        }))
        .sort((left, right) => left.position - right.position);
    }
    if (columnIssues.length > 0) {
      return Array.from(issuesByStatus.entries()).map(([statusId, groupedIssues]) => ({
        statusId,
        name: statusId.slice(0, 8),
        color: '#6b7280',
        issues: groupedIssues,
        position: 0,
      }));
    }
    return [
      { statusId: 'todo', name: 'To Do', color: '#6b7280', issues: [], position: 0 },
      { statusId: 'in_progress', name: 'In Progress', color: '#3b82f6', issues: [], position: 1 },
      { statusId: 'done', name: 'Done', color: '#22c55e', issues: [], position: 2 },
    ];
  };

  const allColumns = buildColumns(issues);
  const totalIssuesByStatus = new Map(
    allColumns.map((column) => [column.statusId, column.issues.length]),
  );
  const swimlanes = buildSwimlanes(issues, swimlaneField, boardData?.groups ?? []);

  const resolveDropTarget = (over: DragOverEvent['over']) => {
    if (!over) return null;
    const data = over.data.current;
    if (data?.statusId) {
      return {
        containerId: String(data.containerId),
        statusId: String(data.statusId),
        swimlaneValue: (data.swimlaneValue as string | null | undefined) ?? null,
      };
    }
    const issue = issues.find((current) => current.id === String(over.id));
    if (!issue) return null;
    return {
      containerId: String(issue.statusId),
      statusId: issue.statusId,
      swimlaneValue: getSwimlaneValue(issue, swimlaneField),
    };
  };

  const handleDragStart = (event: DragStartEvent) => {
    setMoveError(null);
    setWipWarning(null);
    const issue = event.active.data.current?.issue as Issue | undefined;
    if (issue) {
      setActiveIssue(issue);
      setLocalIssues([...issues]);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const target = resolveDropTarget(event.over);
    const issue = event.active.data.current?.issue as Issue | undefined;
    if (!target || !issue) return;

    setOverContainerId(target.containerId);
    const targetColumn = allColumns.find((column) => column.statusId === target.statusId);
    setWipWarning(
      getWipLimitWarning({
        sourceStatusId: issue.statusId,
        targetStatusId: target.statusId,
        targetName: targetColumn?.name ?? target.statusId,
        targetCount: totalIssuesByStatus.get(target.statusId) ?? 0,
        limit: wipLimits[target.statusId],
      }),
    );
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveIssue(null);
    setOverContainerId(null);
    setWipWarning(null);

    if (!over || !localIssues) {
      setLocalIssues(null);
      return;
    }

    const activeId = active.id as string;
    const draggedIssue = issues.find((issue) => issue.id === activeId);
    const target = resolveDropTarget(over);
    if (!draggedIssue || !target) {
      setLocalIssues(null);
      return;
    }

    const result = moveIssueBetweenGroups(issues, {
      activeId,
      overId: over.id as string,
      targetGroupId: target.statusId,
      groupField: 'statusId',
    });
    if (!result.changed || !result.activeIssue) {
      setLocalIssues(null);
      return;
    }

    const sourceSwimlaneValue = getSwimlaneValue(draggedIssue, swimlaneField);
    const swimlaneChanged = sourceSwimlaneValue !== target.swimlaneValue;
    const movedIssue = applySwimlaneValue(result.activeIssue, swimlaneField, target.swimlaneValue);
    const nextIssues = result.issues.map((issue) =>
      issue.id === movedIssue.id ? movedIssue : issue,
    );
    const affectedIssues = result.affectedIssues.map((issue) =>
      issue.id === movedIssue.id ? movedIssue : issue,
    );

    setLocalIssues(nextIssues);

    try {
      if (result.sourceGroupId !== result.targetGroupId || swimlaneChanged) {
        const update: UpdateIssueDto & { issueKey: string } = {
          issueKey: draggedIssue.key,
          statusId: target.statusId,
          sortOrder: movedIssue.sortOrder,
        };
        if (swimlaneChanged && swimlaneField === 'assignee') {
          update.assigneeId = target.swimlaneValue;
        } else if (swimlaneChanged && swimlaneField === 'priority' && target.swimlaneValue) {
          update.priority = target.swimlaneValue as Issue['priority'];
        } else if (swimlaneChanged && swimlaneField === 'epic') {
          update.epicId = target.swimlaneValue;
        }
        await updateIssue.mutateAsync(update);
      }
      const reorderPayload = buildReorderPayload(affectedIssues);
      if (reorderPayload.length > 0) {
        await reorderIssues.mutateAsync({ issues: reorderPayload });
      }
    } catch {
      setMoveError(
        'The issue could not be fully saved. The latest server state has been reloaded.',
      );
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['issues'] });
      await queryClient.invalidateQueries({ queryKey: ['boardIssues', activeBoardId] });
      setLocalIssues(null);
    }
  };

  const handleDragCancel = () => {
    setActiveIssue(null);
    setOverContainerId(null);
    setWipWarning(null);
    setLocalIssues(null);
  };

  const toggleSwimlane = (key: string) => {
    setCollapsedLanes((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleConfigChange = async (config: BoardConfig) => {
    await updateBoard.mutateAsync({ config });
  };

  return (
    <div>
      <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link to={`/projects/${projectKey}`} className="hover:text-primary">
          {projectKey}
        </Link>
        <span>/</span>
        <span className="text-foreground">Board</span>
      </div>

      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">{board.name}</h1>
          <span className="text-sm text-muted-foreground">
            {issues.length} issue{issues.length !== 1 ? 's' : ''}
          </span>
        </div>
        <BoardSettings
          config={board.config}
          statuses={statuses.map((status) => ({ id: status.id, name: status.name }))}
          canConfigure={canConfigure}
          isSaving={updateBoard.isPending}
          hasError={updateBoard.isError}
          onConfigChange={handleConfigChange}
        />
      </div>

      {moveError && (
        <p
          role="alert"
          className="mb-4 border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {moveError}
        </p>
      )}

      {wipWarning && (
        <p
          role="status"
          className="mb-4 border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
        >
          {wipWarning}
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
        <div
          data-testid="kanban-board"
          className={cn(swimlaneField === 'none' ? 'overflow-x-auto pb-4' : 'space-y-4')}
        >
          {swimlaneField === 'none' ? (
            <div className="flex gap-4">
              {buildColumns(swimlanes[0]?.issues ?? issues).map((column) => {
                const containerId = `column-all-${column.statusId}`;
                return (
                  <DroppableColumn
                    key={column.statusId}
                    column={column}
                    containerId={containerId}
                    swimlaneValue={null}
                    totalIssueCount={totalIssuesByStatus.get(column.statusId) ?? 0}
                    wipLimit={wipLimits[column.statusId]}
                    isOver={overContainerId === containerId}
                    canEdit={canEdit}
                    focusedIssueId={focusedIssueId}
                    firstIssueId={firstIssueId}
                    onIssueFocus={setFocusedIssueId}
                  />
                );
              })}
            </div>
          ) : swimlanes.length > 0 ? (
            swimlanes.map((swimlane) => {
              const collapsed = collapsedLanes.has(swimlane.key);
              return (
                <section
                  key={swimlane.key}
                  className="rounded-lg border border-border bg-card/40 p-3"
                >
                  <button
                    type="button"
                    aria-expanded={!collapsed}
                    aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${swimlane.label} swimlane`}
                    className="mb-3 flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => toggleSwimlane(swimlane.key)}
                  >
                    {collapsed ? (
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span>{swimlane.label}</span>
                    <span className="ml-auto text-xs font-normal text-muted-foreground">
                      {swimlane.issues.length} issue{swimlane.issues.length !== 1 ? 's' : ''}
                    </span>
                  </button>
                  {!collapsed && (
                    <div className="flex gap-4 overflow-x-auto pb-2">
                      {buildColumns(swimlane.issues).map((column) => {
                        const containerId = `column-${swimlane.key}-${column.statusId}`;
                        return (
                          <DroppableColumn
                            key={column.statusId}
                            column={column}
                            containerId={containerId}
                            swimlaneValue={swimlane.value}
                            totalIssueCount={totalIssuesByStatus.get(column.statusId) ?? 0}
                            wipLimit={wipLimits[column.statusId]}
                            isOver={overContainerId === containerId}
                            canEdit={canEdit}
                            focusedIssueId={focusedIssueId}
                            firstIssueId={firstIssueId}
                            onIssueFocus={setFocusedIssueId}
                          />
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No issues on this board.
            </p>
          )}
        </div>

        <DragOverlay>
          {activeIssue ? (
            <div className="w-72 rounded-lg border border-primary/50 bg-card p-3 shadow-lg opacity-90">
              <IssueCardContent issue={activeIssue} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
