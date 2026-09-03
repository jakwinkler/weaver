import { useState, type FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
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
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQueryClient } from '@tanstack/react-query';
import {
  useProject,
  useProjectIssues,
  useWorkflow,
  useProjectPlugins,
  useUpdateIssueDynamic,
  useReorderIssues,
} from '@/api';
import { FeatureNotEnabled } from './FeatureNotEnabled';
import { useBoards, useCreateBoard } from '@/api/hooks-phase2';
import type { Issue } from '@weaver/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { moveIssueForBoard } from './kanban-order';

interface StatusColumn {
  statusId: string;
  name: string;
  color: string;
  issues: Issue[];
  position: number;
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

function SortableIssueCard({ issue }: { issue: Issue }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: issue.id, data: { issue, type: 'issue' } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'block cursor-grab rounded-lg border border-border bg-card p-3 shadow-sm transition hover:shadow-md active:cursor-grabbing',
        isDragging && 'opacity-30',
      )}
    >
      <Link to={`/issues/${issue.key}`} onClick={(e) => isDragging && e.preventDefault()}>
        <IssueCardContent issue={issue} />
      </Link>
    </div>
  );
}

function DroppableColumn({
  column,
  isOver,
}: {
  column: StatusColumn;
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({
    id: `column-${column.statusId}`,
    data: { type: 'column', statusId: column.statusId },
  });

  const issueIds = column.issues.map((i) => i.id);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-72 flex-shrink-0 flex-col rounded-lg p-3 transition-colors',
        isOver ? 'bg-primary/10 ring-2 ring-primary/30' : 'bg-muted/50',
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: column.color }}
          />
          <h3 className="text-sm font-semibold text-foreground">{column.name}</h3>
        </div>
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {column.issues.length}
        </span>
      </div>
      <SortableContext items={issueIds} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-[60px] flex-col gap-2">
          {column.issues.map((issue) => (
            <SortableIssueCard key={issue.id} issue={issue} />
          ))}
          {column.issues.length === 0 && !isOver && (
            <p className="py-4 text-center text-xs text-muted-foreground">No issues</p>
          )}
        </div>
      </SortableContext>
    </div>
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
  const { data: projectPlugins } = useProjectPlugins(projectKey!);
  const { data: project, isLoading: projectLoading } = useProject(projectKey!);
  const { data: issuesData, isLoading: issuesLoading } = useProjectIssues({
    projectKey: projectKey!,
    perPage: 200,
  });
  const { data: boards, isLoading: boardsLoading, refetch: refetchBoards } = useBoards(
    project?.id || '',
  );
  const { data: workflow } = useWorkflow(project?.workflowId || '');
  const queryClient = useQueryClient();
  const updateIssue = useUpdateIssueDynamic();
  const reorderIssues = useReorderIssues();

  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);
  const [localIssues, setLocalIssues] = useState<Issue[] | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  if (projectPlugins && !projectPlugins.some((p) => p.pluginId === '@weaver/plugin-board')) {
    return <FeatureNotEnabled featureName="Kanban Board" projectKey={projectKey!} />;
  }

  const isLoading = projectLoading || issuesLoading || boardsLoading;

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

  const hasBoards = boards && boards.length > 0;

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

  const issues = localIssues ?? issuesData?.data ?? [];
  const statuses = workflow?.statuses || [];

  // Group issues by statusId
  const issuesByStatus = new Map<string, Issue[]>();
  for (const issue of issues) {
    const existing = issuesByStatus.get(issue.statusId) || [];
    existing.push(issue);
    issuesByStatus.set(issue.statusId, existing);
  }

  // Sort issues within each column by sortOrder
  for (const [, columnIssues] of issuesByStatus) {
    columnIssues.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // Build columns from workflow statuses
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

  // Resolve a droppable/sortable ID to a statusId
  const resolveStatusId = (id: string): string | undefined => {
    // Check if it's a column ID (e.g. "column-<statusId>")
    if (id.startsWith('column-')) {
      return id.slice(7);
    }
    // Otherwise it's an issue ID — find which column it's in
    for (const col of columns) {
      if (col.issues.some((i) => i.id === id)) {
        return col.statusId;
      }
    }
    return undefined;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const issue = event.active.data.current?.issue as Issue | undefined;
    if (issue) {
      setActiveIssue(issue);
      setLocalIssues([...issues]);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !localIssues) return;

    const activeId = active.id as string;
    const targetStatusId = resolveStatusId(over.id as string);

    if (!targetStatusId) return;

    setOverColumnId(targetStatusId);

    setLocalIssues((prev) => prev
      ? moveIssueForBoard(prev, activeId, over.id as string, targetStatusId)
      : prev);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveIssue(null);
    setOverColumnId(null);

    if (!over || !localIssues) {
      setLocalIssues(null);
      return;
    }

    const activeId = active.id as string;
    const draggedIssue = issues.find((i) => i.id === activeId); // use original, not localIssues
    if (!draggedIssue) {
      setLocalIssues(null);
      return;
    }

    const targetStatusId = resolveStatusId(over.id as string) ?? draggedIssue.statusId;

    // Get issues in target column from localIssues (already moved optimistically)
    const columnIssues = localIssues.filter(
      (i) => i.statusId === targetStatusId || i.id === activeId,
    );
    // Deduplicate (the dragged issue might match both conditions)
    const seen = new Set<string>();
    const uniqueColumnIssues = columnIssues.filter((i) => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    });

    // Compute new sort orders
    const issueUpdates = uniqueColumnIssues.map((issue, idx) => ({
      id: issue.id,
      sortOrder: idx * 1000,
    }));

    // Apply final optimistic update
    const updatedIssues = localIssues.map((issue) => {
      if (issue.id === activeId) {
        return {
          ...issue,
          statusId: targetStatusId,
          sortOrder: issueUpdates.find((u) => u.id === issue.id)?.sortOrder ?? issue.sortOrder,
        };
      }
      const update = issueUpdates.find((u) => u.id === issue.id);
      return update ? { ...issue, sortOrder: update.sortOrder } : issue;
    });
    setLocalIssues(updatedIssues);

    const statusChanged = draggedIssue.statusId !== targetStatusId;

    const cleanup = () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      setLocalIssues(null);
    };

    const persistMove = async () => {
      try {
        if (statusChanged) {
          await updateIssue.mutateAsync({
            issueKey: draggedIssue.key,
            statusId: targetStatusId,
          });
        }
        if (issueUpdates.length > 0) {
          await reorderIssues.mutateAsync({ issues: issueUpdates });
        }
      } finally {
        cleanup();
      }
    };

    void persistMove();
  };

  const handleDragCancel = () => {
    setActiveIssue(null);
    setOverColumnId(null);
    setLocalIssues(null);
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

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">
          {boards![0].name}
        </h1>
        <span className="text-sm text-muted-foreground">
          {issues.length} issue{issues.length !== 1 ? 's' : ''}
        </span>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((column) => (
            <DroppableColumn
              key={column.statusId}
              column={column}
              isOver={overColumnId === column.statusId}
            />
          ))}
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
