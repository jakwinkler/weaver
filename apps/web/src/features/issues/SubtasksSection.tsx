import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ListTree, Plus } from 'lucide-react';
import type { Issue } from '@weaver/shared';
import { useCreateIssue, useProjectIssues, useProjectIssueTypes } from '@/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface SubtasksSectionProps {
  issue: Issue;
  projectKey: string;
  canCreate: boolean;
  statusName: (statusId: string) => string;
  statusColor: (statusId: string) => string;
}

export function SubtasksSection({
  issue,
  projectKey,
  canCreate,
  statusName,
  statusColor,
}: SubtasksSectionProps) {
  const { data, isLoading, isError } = useProjectIssues({
    projectKey,
    parentId: issue.id,
    all: true,
  });
  const subtasks = data?.data ?? [];
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 px-6 pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ListTree className="h-4 w-4" aria-hidden="true" />
          Subtasks
          {subtasks.length > 0 && (
            <span className="font-normal text-muted-foreground">({subtasks.length})</span>
          )}
        </CardTitle>
        {canCreate && !adding && (
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add subtask
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 px-6 pb-4 pt-0">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading subtasks...</p>
        ) : isError ? (
          <p role="alert" className="text-sm text-destructive">
            Could not load subtasks.
          </p>
        ) : subtasks.length > 0 ? (
          <ul aria-label="Subtasks" className="divide-y divide-border rounded-md border border-border">
            {subtasks.map((subtask) => (
              <li key={subtask.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <Link
                  to={`/issues/${subtask.key}`}
                  className="shrink-0 text-sm font-medium text-primary hover:underline"
                >
                  {subtask.key}
                </Link>
                <span className="min-w-0 flex-1 break-words text-sm text-foreground">
                  {subtask.summary}
                </span>
                <span
                  className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: statusColor(subtask.statusId) }}
                >
                  {statusName(subtask.statusId)}
                </span>
                <span
                  className={cn(
                    'w-32 shrink-0 truncate text-right text-xs',
                    subtask.assigneeId ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {subtask.assigneeId
                    ? subtask.assigneeDisplayName || subtask.assigneeId.slice(0, 8)
                    : 'Unassigned'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          !adding && <p className="text-sm text-muted-foreground">No subtasks yet.</p>
        )}
        {adding && (
          <AddSubtaskForm issue={issue} projectKey={projectKey} onClose={() => setAdding(false)} />
        )}
      </CardContent>
    </Card>
  );
}

interface AddSubtaskFormProps {
  issue: Issue;
  projectKey: string;
  onClose: () => void;
}

function AddSubtaskForm({ issue, projectKey, onClose }: AddSubtaskFormProps) {
  const createIssue = useCreateIssue(projectKey);
  const issueTypesQuery = useProjectIssueTypes(projectKey);
  const issueTypes = issueTypesQuery.data;
  const [summary, setSummary] = useState('');
  // null until someone picks a type, so the subtask type still applies once the types load.
  const [chosenTypeId, setChosenTypeId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const summaryRef = useRef<HTMLInputElement>(null);

  const subtaskTypeIdIn = (types: typeof issueTypes) =>
    types?.find((type) => type.isSubtask)?.id ?? '';
  const issueTypeId = chosenTypeId ?? subtaskTypeIdIn(issueTypes);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      // A quick submit can arrive before the types load. Wait for them so the subtask type applies.
      const types = issueTypes ?? (await issueTypesQuery.refetch()).data;
      const typeId = chosenTypeId ?? subtaskTypeIdIn(types);
      await createIssue.mutateAsync({
        summary,
        parentId: issue.id,
        priority: 'medium',
        labels: [],
        customFields: {},
        percentDone: 0,
        ...(typeId ? { issueTypeId: typeId } : {}),
      });
    } catch {
      // Keep the summary so it can be sent again.
      return;
    } finally {
      setSubmitting(false);
    }
    // Stay open so several subtasks can be added in a row.
    setSummary('');
    summaryRef.current?.focus();
  };

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      className="space-y-3 rounded-md border border-border p-3"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_12rem]">
        <div>
          <Label htmlFor="subtaskSummary">Subtask summary</Label>
          <Input
            id="subtaskSummary"
            ref={summaryRef}
            type="text"
            autoFocus
            required
            maxLength={500}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="mt-1"
            placeholder="What needs to be done?"
          />
        </div>
        <div>
          <Label htmlFor="subtaskType">Type</Label>
          <select
            id="subtaskType"
            value={issueTypeId}
            onChange={(e) => setChosenTypeId(e.target.value)}
            className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">None</option>
            {issueTypes?.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {createIssue.isError && (
        <p role="alert" className="text-sm text-destructive">
          Could not create the subtask. Your text is still here. Try again.
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? 'Creating...' : 'Create subtask'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
