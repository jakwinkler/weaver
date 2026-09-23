import { Link } from 'react-router-dom';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import type { Issue, Sprint } from '@weaver/shared';
import { useSprintStats } from '@/api';
import { IssueTypeIcon } from '@/components/IconPicker';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { committedStoryPoints, planningContainerId } from './backlogPlanning';

function formatDate(date: Date | string | undefined): string {
  if (!date) return 'No date';
  return new Date(date).toLocaleDateString();
}

function priorityClasses(priority: string): string {
  const classes: Record<string, string> = {
    highest: 'bg-red-100 text-red-700 border-red-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    low: 'bg-blue-100 text-blue-700 border-blue-200',
    lowest: 'bg-muted text-muted-foreground border-border',
  };
  return classes[priority] ?? classes.medium;
}

export function PlanningIssueContent({ issue }: { issue: Issue }) {
  return (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
        {issue.issueType && (
          <IssueTypeIcon
            icon={issue.issueType.icon}
            iconColor={issue.issueType.iconColor}
            iconAttachmentId={issue.issueType.iconAttachmentId}
          />
        )}
        <Link
          to={`/issues/${issue.key}`}
          className="shrink-0 text-xs font-semibold text-primary hover:underline"
        >
          {issue.key}
        </Link>
        <Link
          to={`/issues/${issue.key}`}
          className="min-w-0 truncate text-sm font-medium text-foreground hover:text-primary"
        >
          {issue.summary}
        </Link>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {issue.storyPoints !== null && issue.storyPoints !== undefined && (
          <Badge variant="outline" className="rounded-full bg-muted text-xs text-foreground">
            {issue.storyPoints} pt{issue.storyPoints === 1 ? '' : 's'}
          </Badge>
        )}
        <Badge className={cn('rounded-full text-xs', priorityClasses(issue.priority))}>
          {issue.priority}
        </Badge>
      </div>
    </>
  );
}

export function SortablePlanningIssue({ issue, canDrag }: { issue: Issue; canDrag: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
    disabled: !canDrag,
    data: {
      type: 'issue',
      issue,
      sprintId: issue.sprintId ?? null,
    },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cn(
        'flex items-center gap-3 border-b border-border bg-card px-3 py-2.5 last:border-b-0',
        canDrag && 'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-30',
      )}
    >
      <PlanningIssueContent issue={issue} />
    </div>
  );
}

interface SprintContainerProps {
  sprint: Sprint;
  issues: Issue[];
  collapsed: boolean;
  isOver: boolean;
  canDrag: boolean;
  onToggle: () => void;
}

export function SprintContainer({
  sprint,
  issues,
  collapsed,
  isOver,
  canDrag,
  onToggle,
}: SprintContainerProps) {
  const { data: stats } = useSprintStats(sprint.id);
  const { setNodeRef } = useDroppable({
    id: planningContainerId(sprint.id),
    disabled: !canDrag,
    data: { type: 'container', sprintId: sprint.id },
  });
  const committedPoints = committedStoryPoints(issues);
  const capacity = sprint.capacity ?? stats?.capacity ?? null;
  const capacityPercent = capacity && capacity > 0 ? (committedPoints / capacity) * 100 : 0;
  const overCapacity = capacity !== null && committedPoints > capacity;

  return (
    <section
      ref={setNodeRef}
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card transition',
        isOver && 'border-primary ring-2 ring-primary/20',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left hover:bg-muted/40"
        aria-expanded={!collapsed}
      >
        <div className="flex min-w-0 items-start gap-2">
          {collapsed ? (
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-foreground">{sprint.name}</h2>
              <Badge variant="outline" className="capitalize">
                {sprint.status}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDate(sprint.startDate)} to {formatDate(sprint.endDate)}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right text-xs text-muted-foreground">
          <p>
            {issues.length} issue{issues.length === 1 ? '' : 's'}
            {stats ? `, ${stats.completedCount} complete` : ''}
          </p>
          <p className={cn('mt-1 font-medium', overCapacity && 'text-red-600')}>
            {capacity === null
              ? `${committedPoints} pts committed`
              : `${committedPoints} / ${capacity} pts`}
          </p>
        </div>
      </button>

      <div className="px-4 pb-3">
        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              overCapacity ? 'bg-red-500' : 'bg-primary',
            )}
            style={{ width: `${Math.min(capacityPercent, 100)}%` }}
          />
        </div>
      </div>

      {!collapsed && (
        <SortableContext
          items={issues.map((issue) => issue.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="min-h-12 border-t border-border">
            {issues.map((issue) => (
              <SortablePlanningIssue key={issue.id} issue={issue} canDrag={canDrag} />
            ))}
            {issues.length === 0 && (
              <p className="px-4 py-4 text-center text-sm text-muted-foreground">
                Drop issues here to add them to this sprint.
              </p>
            )}
          </div>
        </SortableContext>
      )}
    </section>
  );
}
