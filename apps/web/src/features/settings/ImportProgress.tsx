import { AlertCircle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useCancelImport, useImportStatus } from '@/api';
import { Button } from '@/components/ui/button';

interface ImportProgressProps {
  importId: string;
  onStartAnother: () => void;
}

export function ImportProgress({ importId, onStartAnother }: ImportProgressProps) {
  const status = useImportStatus(importId);
  const cancel = useCancelImport(importId);
  const job = status.data;

  if (status.isError) {
    return (
      <div className="space-y-3 py-6">
        <p className="text-sm text-destructive">Unable to load the import status.</p>
        <Button type="button" variant="outline" onClick={() => status.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (status.isLoading || !job) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading import status...
      </div>
    );
  }

  const isActive = job.status === 'queued' || job.status === 'running';
  const isCompleted = job.status === 'completed';

  return (
    <div className="space-y-5" aria-live="polite">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            {isCompleted ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : isActive ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : (
              <XCircle className="h-5 w-5 text-destructive" />
            )}
            <h3 className="font-semibold capitalize text-foreground">Import {job.status}</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{job.currentStep}</p>
        </div>
        <span className="text-sm font-medium text-foreground">{job.progress}%</span>
      </div>

      <div>
        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${
              job.status === 'failed' ? 'bg-destructive' : 'bg-primary'
            }`}
            style={{ width: `${job.progress}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span>{job.importedItems} imported</span>
          <span>{job.skippedItems} duplicates skipped</span>
          <span>{job.totalItems} discovered</span>
          <span>{job.errors.length} errors</span>
        </div>
      </div>

      {job.errors.length > 0 && (
        <div className="border border-destructive/30 bg-destructive/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertCircle className="h-4 w-4" />
            Items that could not be imported
          </div>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm text-foreground">
            {job.errors.map((error, index) => (
              <li key={`${error.itemType}-${error.itemId ?? index}-${index}`}>
                <span className="font-medium">{error.itemType}</span>
                {error.itemId ? ` ${error.itemId}` : ''}: {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-3">
        {isActive && (
          <Button
            type="button"
            variant="outline"
            onClick={() => cancel.mutate()}
            disabled={cancel.isPending}
          >
            {cancel.isPending ? 'Cancelling...' : 'Cancel import'}
          </Button>
        )}
        {!isActive && (
          <Button type="button" onClick={onStartAnother}>
            Start another Jira import
          </Button>
        )}
      </div>
    </div>
  );
}
