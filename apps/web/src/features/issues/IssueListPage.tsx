import { useState, useCallback, useEffect, useRef, type FormEvent } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';
import {
  useProjectIssues,
  useCreateIssue,
  useProject,
  useIssueTypes,
  useWorkflow,
  useSprints,
  useHasPermission,
  useUpdateIssueDynamic,
  useReorderIssues,
  useTransitionIssueDynamic,
  useUsers,
} from '@/api';
import type { IssuePriority, Issue, PaginatedResponse, UpdateIssueDto } from '@weaver/shared';
import { IssueTypeIcon } from '@/components/IconPicker';
import { Pagination, getStoredPerPage } from '@/components/Pagination';
import { SortableHeader, type SortDirection } from '@/components/SortableHeader';
import { EditableCell } from '@/components/EditableCell';
import { InlineSelect, type InlineSelectOption } from '@/components/InlineSelect';
import { InlineDatePicker } from '@/components/InlineDatePicker';
import { StoryPointsField } from '@/components/StoryPointsField';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useHotkeys } from '@/hooks/useHotkeys';
import { buildReorderPayload, reorderIssueList } from './dragAndDrop';
import { BulkActionBar } from './BulkActionBar';
import {
  getPageSelectionState,
  setCurrentPageSelection,
  toggleIssueSelection as toggleIssueSelectionInRange,
} from './issueSelection';

const UNASSIGNED_VALUE = '__unassigned__';

const PRIORITY_OPTIONS: InlineSelectOption[] = [
  { value: 'lowest', label: 'lowest' },
  { value: 'low', label: 'low' },
  { value: 'medium', label: 'medium' },
  { value: 'high', label: 'high' },
  { value: 'highest', label: 'highest' },
];

function parseSortParam(sort: string | null): { field: string | null; direction: SortDirection } {
  if (!sort) return { field: null, direction: null };
  const desc = sort.startsWith('-');
  return { field: desc ? sort.slice(1) : sort, direction: desc ? 'desc' : 'asc' };
}

function buildSortParam(field: string | null, direction: SortDirection): string | undefined {
  if (!field || !direction) return undefined;
  return direction === 'desc' ? `-${field}` : field;
}

interface SortableIssueRowProps {
  issue: Issue;
  index: number;
  focused: boolean;
  selected: boolean;
  canBulkSelect: boolean;
  canEdit: boolean;
  canReorder: boolean;
  canTransition: boolean;
  assigneeOptions: InlineSelectOption[];
  getStatusOptions: (currentStatusId: string) => InlineSelectOption[];
  getStatusInfo: (statusId: string) => { name: string; color: string };
  getAssigneeName: (assigneeId: string | null | undefined) => string;
  onInlineUpdate: (
    issueKey: string,
    field: keyof UpdateIssueDto,
    value: UpdateIssueDto[keyof UpdateIssueDto],
  ) => Promise<void>;
  onStatusUpdate: (issueKey: string, fromStatusId: string, toStatusId: string) => Promise<void>;
  onSelectionChange: (issueId: string, index: number, rangeSelection?: boolean) => void;
  onKeyboardFocus: (index: number) => void;
  setRowRef: (issueId: string, node: HTMLTableRowElement | null) => void;
}

function SortableIssueRow({
  issue,
  index,
  focused,
  selected,
  canBulkSelect,
  canEdit,
  canReorder,
  canTransition,
  assigneeOptions,
  getStatusOptions,
  getStatusInfo,
  getAssigneeName,
  onInlineUpdate,
  onStatusUpdate,
  onSelectionChange,
  onKeyboardFocus,
  setRowRef,
}: SortableIssueRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
    disabled: !canReorder,
    data: { issue },
  });

  return (
    <TableRow
      ref={(node) => {
        setNodeRef(node);
        setRowRef(issue.id, node);
      }}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="issue-row"
      tabIndex={focused ? 0 : -1}
      data-keyboard-active={focused ? 'true' : 'false'}
      aria-selected={selected}
      onFocus={(event) => {
        if (event.currentTarget === event.target) onKeyboardFocus(index);
      }}
      className={cn(
        'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
        selected && 'bg-primary/5',
        focused && 'bg-accent ring-2 ring-primary/30 ring-inset',
        isDragging && 'relative z-10 bg-card opacity-35',
      )}
    >
      <TableCell className="w-10 px-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={!canReorder}
          aria-label={
            canReorder ? `Reorder ${issue.key}` : 'Clear column sorting to reorder issues'
          }
          title={canReorder ? `Reorder ${issue.key}` : 'Clear column sorting to reorder issues'}
          className="flex h-8 w-8 cursor-grab items-center justify-center text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-25"
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
      </TableCell>
      {canBulkSelect && (
        <TableCell className="w-10">
          <Checkbox
            aria-label={`Select ${issue.key}`}
            checked={selected}
            onClick={(event) => onSelectionChange(issue.id, index, event.shiftKey)}
          />
        </TableCell>
      )}
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
        {issue.issueType ? (
          <span className="inline-flex items-center gap-1.5" title={issue.issueType.name}>
            <IssueTypeIcon
              icon={issue.issueType.icon}
              iconColor={issue.issueType.iconColor}
              iconAttachmentId={issue.issueType.iconAttachmentId}
            />
            <span className="text-xs">{issue.issueType.name}</span>
          </span>
        ) : (
          '—'
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm font-medium text-primary">
        <Link to={`/issues/${issue.key}`}>{issue.key}</Link>
      </TableCell>
      <TableCell className="text-sm text-foreground">
        {canEdit ? (
          <EditableCell
            value={issue.summary}
            onSave={(val) => onInlineUpdate(issue.key, 'summary', val)}
          />
        ) : (
          <Link to={`/issues/${issue.key}`}>{issue.summary}</Link>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <InlineSelect
          value={issue.priority}
          options={PRIORITY_OPTIONS}
          onSave={(val) => onInlineUpdate(issue.key, 'priority', val as IssuePriority)}
          editable={canEdit}
          ariaLabel={`Edit ${issue.key} priority`}
          renderValue={(val) => <PriorityBadge priority={val} />}
        />
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <StoryPointsField
          value={issue.storyPoints}
          onChange={(value) => onInlineUpdate(issue.key, 'storyPoints', value)}
          disabled={!canEdit}
          showChips={false}
          compact
        />
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <InlineSelect
          value={issue.statusId}
          options={getStatusOptions(issue.statusId)}
          onSave={(val) => onStatusUpdate(issue.key, issue.statusId, val)}
          editable={canEdit && canTransition}
          ariaLabel={`Edit ${issue.key} status`}
          renderValue={(val, opt) => {
            const info = opt
              ? { name: opt.label, color: opt.color || '#6b7280' }
              : getStatusInfo(val);
            return (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                style={{ backgroundColor: info.color }}
              >
                {info.name}
              </span>
            );
          }}
        />
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <InlineSelect
          value={issue.assigneeId || UNASSIGNED_VALUE}
          options={assigneeOptions}
          onSave={(val) =>
            onInlineUpdate(issue.key, 'assigneeId', val === UNASSIGNED_VALUE ? null : val)
          }
          editable={canEdit}
          ariaLabel={`Edit ${issue.key} assignee`}
          renderValue={(val) => (
            <span className="text-sm text-foreground">
              {getAssigneeName(val === UNASSIGNED_VALUE ? null : val)}
            </span>
          )}
        />
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <InlineDatePicker
          value={issue.dueDate || null}
          onSave={(val) => onInlineUpdate(issue.key, 'dueDate', val)}
          editable={canEdit}
          ariaLabel={`Edit ${issue.key} due date`}
        />
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
        {issue.createdAt ? new Date(issue.createdAt).toLocaleDateString() : '-'}
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 rounded-full bg-muted/50">
            <div
              className="h-1.5 rounded-full bg-primary"
              style={{ width: `${issue.percentDone ?? 0}%` }}
            />
          </div>
          <span className="text-xs">{issue.percentDone ?? 0}%</span>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function IssueListPage() {
  const { projectKey } = useParams<{ projectKey: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page')) || 1;
  const perPage = Number(searchParams.get('perPage')) || getStoredPerPage();
  const sortParam = searchParams.get('sort');
  const { field: sortField, direction: sortDirection } = parseSortParam(sortParam);

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(updates)) {
          if (v === undefined || v === '') {
            next.delete(k);
          } else {
            next.set(k, v);
          }
        }
        return next;
      });
    },
    [setSearchParams],
  );

  const { data: project } = useProject(projectKey!);
  const { data, isLoading } = useProjectIssues({
    projectKey: projectKey!,
    page,
    perPage,
    sort: buildSortParam(sortField, sortDirection) ?? 'sortOrder',
  });
  const createIssue = useCreateIssue(projectKey!);
  const updateIssue = useUpdateIssueDynamic();
  const reorderIssues = useReorderIssues();
  const transitionIssue = useTransitionIssueDynamic();
  const { data: issueTypes } = useIssueTypes();
  const { data: workflow } = useWorkflow(project?.workflowId || '');
  const { data: sprints } = useSprints(project?.id || '');
  const { data: users } = useUsers();
  const canCreate = useHasPermission('issues.create');
  const canEdit = useHasPermission('issues.update');
  const canTransition = useHasPermission('issues.transition');
  const canDelete = useHasPermission('issues.delete');
  const canBulkSelect = canEdit || canDelete;
  const canReorder = canEdit && !sortParam;

  const [localIssues, setLocalIssues] = useState<Issue[] | null>(null);
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [inlineEditError, setInlineEditError] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const statusOptions: InlineSelectOption[] = (workflow?.statuses || []).map((s) => ({
    value: s.id,
    label: s.name,
    color: s.color || '#6b7280',
  }));

  const assigneeOptions: InlineSelectOption[] = [
    { value: UNASSIGNED_VALUE, label: 'Unassigned' },
    ...(users || []).map((user) => ({
      value: user.id,
      label: user.displayName || user.email,
    })),
  ];

  const getStatusOptions = (currentStatusId: string) => {
    const transitionTargets = new Set([
      currentStatusId,
      ...(workflow?.transitions || [])
        .filter((transition) => transition.fromStatusId === currentStatusId)
        .map((transition) => transition.toStatusId),
    ]);
    return statusOptions.filter((option) => transitionTargets.has(option.value));
  };

  const getStatusInfo = (statusId: string) => {
    const status = workflow?.statuses?.find((s) => s.id === statusId);
    return { name: status?.name || statusId.slice(0, 8), color: status?.color || '#6b7280' };
  };

  const getAssigneeName = (assigneeId: string | null | undefined) => {
    if (!assigneeId) return 'Unassigned';
    const assignee = users?.find((user) => user.id === assigneeId);
    return assignee?.displayName || assignee?.email || assigneeId.slice(0, 8);
  };

  const handleOptimisticChange = async <K extends keyof UpdateIssueDto>(
    issueKey: string,
    field: K,
    value: UpdateIssueDto[K],
    persist: () => Promise<unknown>,
  ) => {
    // Optimistic update
    const queryKeyPrefix = ['issues', projectKey];
    const previousData = queryClient.getQueriesData<PaginatedResponse<Issue>>({
      queryKey: queryKeyPrefix,
    });

    queryClient.setQueriesData<PaginatedResponse<Issue>>({ queryKey: queryKeyPrefix }, (old) => {
      if (!old) return old;
      return {
        ...old,
        data: old.data.map((issue) =>
          issue.key === issueKey ? { ...issue, [field]: value } : issue,
        ),
      };
    });

    try {
      await persist();
    } catch (error) {
      // Rollback on error
      for (const [key, data] of previousData) {
        if (data) {
          queryClient.setQueryData(key, data);
        }
      }
      setInlineEditError(`Could not update ${issueKey}. Your change was reverted.`);
      throw error;
    }
  };

  const handleInlineUpdate = <K extends keyof UpdateIssueDto>(
    issueKey: string,
    field: K,
    value: UpdateIssueDto[K],
  ) =>
    handleOptimisticChange(issueKey, field, value, () =>
      updateIssue.mutateAsync({ issueKey, [field]: value } as UpdateIssueDto & {
        issueKey: string;
      }),
    );

  const handleStatusUpdate = (issueKey: string, fromStatusId: string, toStatusId: string) => {
    const transition = workflow?.transitions?.find(
      (candidate) => candidate.fromStatusId === fromStatusId && candidate.toStatusId === toStatusId,
    );

    if (!transition) {
      setInlineEditError(`Could not update ${issueKey}. That transition is not available.`);
      return Promise.reject(
        new Error(`No workflow transition from ${fromStatusId} to ${toStatusId}`),
      );
    }

    return handleOptimisticChange(issueKey, 'statusId', toStatusId, () =>
      transitionIssue.mutateAsync({ issueKey, transitionId: transition.id }),
    );
  };

  const [showForm, setShowForm] = useState(false);
  const [summary, setSummary] = useState('');
  const [issueTypeId, setIssueTypeId] = useState('');
  const [priority, setPriority] = useState<IssuePriority>('medium');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [storyPoints, setStoryPoints] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<string>>(() => new Set());
  const lastSelectedIndex = useRef<number | null>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const issues = localIssues ?? data?.data ?? [];
  const issueKeys = issues.map((issue) => issue.key).join('|');

  const clearSelection = useCallback(() => {
    setSelectedIssueIds(new Set());
    lastSelectedIndex.current = null;
  }, []);

  const handleIssueSelection = useCallback(
    (issueId: string, index: number, rangeSelection = false) => {
      const orderedIssueIds = data?.data.map((issue) => issue.id) ?? [];
      setSelectedIssueIds((current) =>
        toggleIssueSelectionInRange(
          current,
          orderedIssueIds,
          issueId,
          lastSelectedIndex.current,
          rangeSelection,
        ),
      );
      lastSelectedIndex.current = index;
    },
    [data?.data],
  );

  const handleSelectAll = useCallback(
    (selected: boolean) => {
      const currentPageIssueIds = data?.data.map((issue) => issue.id) ?? [];
      setSelectedIssueIds((current) =>
        setCurrentPageSelection(current, currentPageIssueIds, selected),
      );
      lastSelectedIndex.current = null;
    },
    [data?.data],
  );

  // Reset keyboard state when the visible result set changes.
  useEffect(() => {
    setFocusedIndex(-1);
    clearSelection();
    setLocalIssues(null);
  }, [clearSelection, data, page, perPage, projectKey, sortParam]);

  useEffect(() => {
    const focusedIssue = issues[focusedIndex];
    if (!focusedIssue) return;
    const row = rowRefs.current.get(focusedIssue.id);
    row?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex, issueKeys]);

  useEffect(() => {
    if (searchParams.get('create') !== '1') return;
    setShowForm(true);
    updateParams({ create: undefined });
  }, [searchParams, updateParams]);

  const moveFocus = (delta: -1 | 1) => {
    if (issues.length === 0) return;
    setFocusedIndex((previous) => {
      if (previous < 0) return 0;
      return Math.max(0, Math.min(previous + delta, issues.length - 1));
    });
  };

  useHotkeys(
    [
      { keys: 'j', handler: () => moveFocus(1) },
      { keys: 'k', handler: () => moveFocus(-1) },
      {
        keys: 'Enter',
        handler: () => {
          const focusedIssue = issues[focusedIndex];
          if (focusedIssue) navigate(`/issues/${focusedIssue.key}`);
        },
        enabled: focusedIndex >= 0,
      },
      {
        keys: 'x',
        handler: () => {
          const focusedIssue = issues[focusedIndex];
          if (focusedIssue) handleIssueSelection(focusedIssue.id, focusedIndex);
        },
        enabled: canBulkSelect && focusedIndex >= 0,
      },
    ],
    { context: 'list', ignoreInteractiveElements: true },
  );

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    await createIssue.mutateAsync({
      summary,
      priority,
      labels: [],
      customFields: {},
      percentDone: 0,
      ...(storyPoints !== null ? { storyPoints } : {}),
      ...(issueTypeId ? { issueTypeId } : {}),
      ...(startDate ? { startDate } : {}),
      ...(dueDate ? { dueDate } : {}),
    });
    setSummary('');
    setIssueTypeId('');
    setPriority('medium');
    setStartDate('');
    setDueDate('');
    setStoryPoints(null);
    setShowForm(false);
  };

  const handlePageChange = (newPage: number) => {
    updateParams({ page: newPage === 1 ? undefined : String(newPage) });
  };

  const handlePerPageChange = (newPerPage: number) => {
    updateParams({ perPage: String(newPerPage), page: undefined });
  };

  const handleSort = (field: string, direction: SortDirection) => {
    const sort = buildSortParam(field, direction);
    updateParams({ sort, page: undefined });
  };

  const currentPageIssueIds = data?.data.map((issue) => issue.id) ?? [];
  const { allSelected, someSelected } = getPageSelectionState(
    selectedIssueIds,
    currentPageIssueIds,
  );

  const handleDragStart = (event: DragStartEvent) => {
    const issue = event.active.data.current?.issue as Issue | undefined;
    setReorderError(null);
    setActiveIssue(issue ?? null);
    setLocalIssues([...(data?.data ?? [])]);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveIssue(null);
    const { active, over } = event;
    const currentIssues = localIssues ?? data?.data ?? [];

    if (!over || active.id === over.id) {
      setLocalIssues(null);
      return;
    }

    const reordered = reorderIssueList(
      currentIssues,
      active.id as string,
      over.id as string,
      (page - 1) * perPage,
    );
    setLocalIssues(reordered);

    try {
      await reorderIssues.mutateAsync({ issues: buildReorderPayload(reordered) });
    } catch {
      setReorderError(
        'The issue order could not be saved. The latest server state has been reloaded.',
      );
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['issues', projectKey] });
      setLocalIssues(null);
    }
  };

  const handleDragCancel = () => {
    setActiveIssue(null);
    setLocalIssues(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading issues...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to={`/projects/${projectKey}`} className="hover:text-primary">
              {project?.name || projectKey}
            </Link>
            <span>/</span>
            <span>Issues</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Issues</h1>
          {selectedIssueIds.size > 0 && (
            <p className="mt-1 text-sm text-primary" aria-live="polite">
              {selectedIssueIds.size} selected
            </p>
          )}
        </div>
        {canCreate && (
          <Button onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'Create Issue'}
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardContent className="pt-5">
            <form onSubmit={handleCreate}>
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="issueSummary">Summary</Label>
                  <Input
                    id="issueSummary"
                    type="text"
                    autoFocus
                    required
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    className="mt-1"
                    placeholder="Issue summary"
                  />
                </div>
                <div>
                  <Label htmlFor="issueType">Type</Label>
                  <select
                    id="issueType"
                    value={issueTypeId}
                    onChange={(e) => setIssueTypeId(e.target.value)}
                    className={cn(
                      'border-input mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm',
                      'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
                    )}
                  >
                    <option value="">None</option>
                    {issueTypes?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="issuePriority">Priority</Label>
                  <select
                    id="issuePriority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as IssuePriority)}
                    className={cn(
                      'border-input mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm',
                      'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
                    )}
                  >
                    <option value="lowest">Lowest</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="highest">Highest</option>
                  </select>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="issueStoryPoints">Story Points</Label>
                  <div className="mt-1">
                    <StoryPointsField
                      id="issueStoryPoints"
                      value={storyPoints}
                      onChange={setStoryPoints}
                      values={[1, 2, 3, 5, 8, 13]}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="issueStartDate">Start Date</Label>
                  <Input
                    id="issueStartDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="issueDueDate">Due Date</Label>
                  <Input
                    id="issueDueDate"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              {createIssue.isError && (
                <p className="mt-2 text-sm text-red-600">Failed to create issue.</p>
              )}
              <div className="mt-4">
                <Button type="submit" disabled={createIssue.isPending}>
                  {createIssue.isPending ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {reorderError && (
        <p
          role="alert"
          className="mb-4 border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {reorderError}
        </p>
      )}

      {canBulkSelect && (
        <BulkActionBar
          selectedIssueIds={[...selectedIssueIds]}
          statusOptions={statusOptions}
          assigneeOptions={(users || []).map((user) => ({
            value: user.id,
            label: user.displayName || user.email,
          }))}
          sprintOptions={(sprints || []).map((sprint) => ({
            value: sprint.id,
            label: sprint.name,
          }))}
          canUpdate={canEdit}
          canDelete={canDelete}
          onClearSelection={clearSelection}
        />
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-10 px-2">
                  <span className="sr-only">Reorder</span>
                </TableHead>
                {canBulkSelect && (
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Select all issues on this page"
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={(checked) => handleSelectAll(checked === true)}
                    />
                  </TableHead>
                )}
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Type
                </TableHead>
                <SortableHeader
                  label="Key"
                  field="key"
                  currentSort={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Summary"
                  field="summary"
                  currentSort={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Priority"
                  field="priority"
                  currentSort={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Points
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Assignee
                </TableHead>
                <SortableHeader
                  label="Due Date"
                  field="dueDate"
                  currentSort={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Created"
                  field="createdAt"
                  currentSort={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                />
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  % Done
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SortableContext
                items={(localIssues ?? data?.data ?? []).map((issue) => issue.id)}
                strategy={verticalListSortingStrategy}
              >
                {(localIssues ?? data?.data ?? []).map((issue, index) => (
                  <SortableIssueRow
                    key={issue.id}
                    issue={issue}
                    index={index}
                    focused={focusedIndex === index}
                    selected={selectedIssueIds.has(issue.id)}
                    canBulkSelect={canBulkSelect}
                    canEdit={canEdit}
                    canReorder={canReorder}
                    canTransition={canTransition}
                    assigneeOptions={assigneeOptions}
                    getStatusOptions={getStatusOptions}
                    getStatusInfo={getStatusInfo}
                    getAssigneeName={getAssigneeName}
                    onInlineUpdate={handleInlineUpdate}
                    onStatusUpdate={handleStatusUpdate}
                    onSelectionChange={handleIssueSelection}
                    onKeyboardFocus={setFocusedIndex}
                    setRowRef={(issueId, node) => {
                      if (node) rowRefs.current.set(issueId, node);
                      else rowRefs.current.delete(issueId);
                    }}
                  />
                ))}
              </SortableContext>
              {data?.data.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canBulkSelect ? 12 : 11}
                    className="px-6 py-8 text-center text-sm text-muted-foreground"
                  >
                    No issues yet. Create your first issue to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
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

      {data && (
        <Pagination
          page={data.meta.page}
          perPage={data.meta.perPage}
          total={data.meta.total}
          totalPages={data.meta.totalPages}
          onPageChange={handlePageChange}
          onPerPageChange={handlePerPageChange}
        />
      )}

      {inlineEditError && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-md border border-destructive/40 bg-background px-4 py-3 text-sm text-foreground shadow-lg"
        >
          <span>{inlineEditError}</span>
          <button
            type="button"
            className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Dismiss inline edit error"
            onClick={() => setInlineEditError(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
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
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        colors[priority] ?? 'bg-gray-100 text-gray-700',
      )}
    >
      {priority}
    </span>
  );
}
