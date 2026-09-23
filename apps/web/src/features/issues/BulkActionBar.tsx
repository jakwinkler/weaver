import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import type { BulkIssueUpdatesDto, IssuePriority } from '@weaver/shared';
import { useBulkDeleteIssues, useBulkUpdateIssues } from '@/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface BulkActionOption {
  value: string;
  label: string;
}

interface BulkActionBarProps {
  selectedIssueIds: string[];
  statusOptions: BulkActionOption[];
  assigneeOptions: BulkActionOption[];
  sprintOptions: BulkActionOption[];
  canUpdate: boolean;
  canDelete: boolean;
  onClearSelection: () => void;
}

const priorityOptions: BulkActionOption[] = [
  { value: 'lowest', label: 'Lowest' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'highest', label: 'Highest' },
];

export function BulkActionBar({
  selectedIssueIds,
  statusOptions,
  assigneeOptions,
  sprintOptions,
  canUpdate,
  canDelete,
  onClearSelection,
}: BulkActionBarProps) {
  const bulkUpdate = useBulkUpdateIssues();
  const bulkDelete = useBulkDeleteIssues();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (selectedIssueIds.length === 0) return null;

  const isPending = bulkUpdate.isPending || bulkDelete.isPending;

  const applyUpdate = async (updates: BulkIssueUpdatesDto) => {
    setErrorMessage(null);
    try {
      await bulkUpdate.mutateAsync({ issueIds: selectedIssueIds, updates });
      onClearSelection();
    } catch {
      setErrorMessage('Bulk update failed. No issues were changed.');
    }
  };

  const confirmDelete = async () => {
    setErrorMessage(null);
    try {
      await bulkDelete.mutateAsync(selectedIssueIds);
      setDeleteDialogOpen(false);
      onClearSelection();
    } catch {
      setDeleteDialogOpen(false);
      setErrorMessage('Bulk delete failed. No issues were deleted.');
    }
  };

  return (
    <>
      <div className="sticky top-4 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-background px-3 py-3 shadow-lg">
        <span className="mr-1 text-sm font-semibold">
          {selectedIssueIds.length} {selectedIssueIds.length === 1 ? 'issue' : 'issues'} selected
        </span>

        {canUpdate && (
          <>
            <BulkActionSelect
              label="Change status"
              placeholder="Status"
              options={statusOptions}
              disabled={isPending || statusOptions.length === 0}
              onSelect={(statusId) => applyUpdate({ statusId })}
            />
            <BulkActionSelect
              label="Change assignee"
              placeholder="Assignee"
              options={[{ value: '__none__', label: 'Unassigned' }, ...assigneeOptions]}
              disabled={isPending}
              onSelect={(assigneeId) =>
                applyUpdate({ assigneeId: assigneeId === '__none__' ? null : assigneeId })
              }
            />
            <BulkActionSelect
              label="Change priority"
              placeholder="Priority"
              options={priorityOptions}
              disabled={isPending}
              onSelect={(priority) => applyUpdate({ priority: priority as IssuePriority })}
            />
            <BulkActionSelect
              label="Move to sprint"
              placeholder="Sprint"
              options={[{ value: '__none__', label: 'No sprint' }, ...sprintOptions]}
              disabled={isPending}
              onSelect={(sprintId) =>
                applyUpdate({ sprintId: sprintId === '__none__' ? null : sprintId })
              }
            />
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {canDelete && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isPending}
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 />
              Delete
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={isPending}
            onClick={onClearSelection}
            aria-label="Clear issue selection"
          >
            <X />
          </Button>
        </div>

        {isPending && <span className="text-xs text-muted-foreground">Applying...</span>}
        {errorMessage && (
          <p role="alert" className="w-full text-sm text-destructive">
            {errorMessage}
          </p>
        )}
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete selected issues?</DialogTitle>
            <DialogDescription>
              This will permanently delete {selectedIssueIds.length}{' '}
              {selectedIssueIds.length === 1 ? 'issue' : 'issues'} and their related comments,
              attachments, links, time entries, and activity.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={bulkDelete.isPending}
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={bulkDelete.isPending}
              onClick={confirmDelete}
            >
              {bulkDelete.isPending
                ? 'Deleting...'
                : `Delete ${selectedIssueIds.length} ${selectedIssueIds.length === 1 ? 'issue' : 'issues'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface BulkActionSelectProps {
  label: string;
  placeholder: string;
  options: BulkActionOption[];
  disabled: boolean;
  onSelect: (value: string) => void | Promise<void>;
}

function BulkActionSelect({
  label,
  placeholder,
  options,
  disabled,
  onSelect,
}: BulkActionSelectProps) {
  return (
    <select
      aria-label={label}
      value=""
      disabled={disabled}
      onChange={(event) => {
        if (event.target.value) void onSelect(event.target.value);
      }}
      className={cn(
        'h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm',
        'focus:outline-none focus:ring-2 focus:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
      )}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
