import { useState, useCallback, useEffect, type FormEvent } from 'react';
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
import { GripVertical } from 'lucide-react';
import {
  useProjectIssues,
  useCreateIssue,
  useProject,
  useIssueTypes,
  useWorkflow,
  useHasPermission,
  useUpdateIssueDynamic,
  useReorderIssues,
} from '@/api';
import type { IssuePriority, Issue, PaginatedResponse } from '@weaver/shared';
import { IssueTypeIcon } from '@/components/IconPicker';
import { Pagination, getStoredPerPage } from '@/components/Pagination';
import { SortableHeader, type SortDirection } from '@/components/SortableHeader';
import { EditableCell } from '@/components/EditableCell';
import { InlineSelect, type InlineSelectOption } from '@/components/InlineSelect';
import { InlineDatePicker } from '@/components/InlineDatePicker';
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
import { buildReorderPayload, reorderIssueList } from './dragAndDrop';

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
  canEdit: boolean;
  canReorder: boolean;
  statusOptions: InlineSelectOption[];
  getStatusInfo: (statusId: string) => { name: string; color: string };
  onInlineUpdate: (issueKey: string, field: string, value: unknown) => Promise<void>;
}

function SortableIssueRow({
  issue,
  focused,
  canEdit,
  canReorder,
  statusOptions,
  getStatusInfo,
  onInlineUpdate,
}: SortableIssueRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
    disabled: !canReorder,
    data: { issue },
  });

  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="issue-row"
      className={cn(
        'hover:bg-muted/50',
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
          onSave={(val) => onInlineUpdate(issue.key, 'priority', val)}
          editable={canEdit}
          renderValue={(val) => <PriorityBadge priority={val} />}
        />
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <InlineSelect
          value={issue.statusId}
          options={statusOptions}
          onSave={(val) => onInlineUpdate(issue.key, 'statusId', val)}
          editable={canEdit}
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
        <InlineDatePicker
          value={issue.dueDate || null}
          onSave={(val) => onInlineUpdate(issue.key, 'dueDate', val)}
          editable={canEdit}
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
  const { data: issueTypes } = useIssueTypes();
  const { data: workflow } = useWorkflow(project?.workflowId || '');
  const canCreate = useHasPermission('issues.create');
  const canEdit = useHasPermission('issues.update');
  const canReorder = canEdit && !sortParam;

  const [localIssues, setLocalIssues] = useState<Issue[] | null>(null);
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const statusOptions: InlineSelectOption[] = (workflow?.statuses || []).map((s: any) => ({
    value: s.id,
    label: s.name,
    color: s.color || '#6b7280',
  }));

  const getStatusInfo = (statusId: string) => {
    const status = workflow?.statuses?.find((s: any) => s.id === statusId);
    return { name: status?.name || statusId.slice(0, 8), color: status?.color || '#6b7280' };
  };

  const handleInlineUpdate = async (issueKey: string, field: string, value: unknown) => {
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
      await updateIssue.mutateAsync({ issueKey, [field]: value } as any);
    } catch {
      // Rollback on error
      for (const [key, data] of previousData) {
        if (data) {
          queryClient.setQueryData(key, data);
        }
      }
    }
  };

  const [showForm, setShowForm] = useState(false);
  const [summary, setSummary] = useState('');
  const [issueTypeId, setIssueTypeId] = useState('');
  const [priority, setPriority] = useState<IssuePriority>('medium');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  // Reset focused index when data or page changes
  useEffect(() => {
    setFocusedIndex(-1);
    setLocalIssues(null);
  }, [data, page]);

  // j/k/Enter keyboard navigation for issue list
  useEffect(() => {
    const issues = localIssues ?? data?.data;
    if (!issues || issues.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      const isInput = tagName === 'input' || tagName === 'textarea' || tagName === 'select';
      if (isInput || target.isContentEditable) return;

      if (e.key === 'j') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, issues.length - 1));
      } else if (e.key === 'k') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        setFocusedIndex((prev) => {
          if (prev >= 0 && prev < issues.length) {
            e.preventDefault();
            navigate(`/issues/${issues[prev].key}`);
          }
          return prev;
        });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [data, localIssues, navigate]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    await createIssue.mutateAsync({
      summary,
      priority,
      labels: [],
      customFields: {},
      percentDone: 0,
      ...(issueTypeId ? { issueTypeId } : {}),
      ...(startDate ? { startDate } : {}),
      ...(dueDate ? { dueDate } : {}),
    });
    setSummary('');
    setIssueTypeId('');
    setPriority('medium');
    setStartDate('');
    setDueDate('');
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
              <div className="mt-4 grid grid-cols-2 gap-4">
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
                  Status
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
                    canEdit={canEdit}
                    canReorder={canReorder}
                    statusOptions={statusOptions}
                    getStatusInfo={getStatusInfo}
                    onInlineUpdate={handleInlineUpdate}
                  />
                ))}
              </SortableContext>
              {data?.data.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
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
