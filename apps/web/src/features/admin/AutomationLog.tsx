import { CheckCircle2, ChevronDown, Clock3, XCircle } from 'lucide-react';
import { useAutomationLog } from '@/api';

export function AutomationLog({ ruleId }: { ruleId: string }) {
  const { data: executions, isLoading, isError } = useAutomationLog(ruleId);

  return (
    <details className="group border-t border-border bg-muted/15">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        Execution history
        {executions && executions.length > 0 && (
          <span className="ml-1 text-xs font-normal tabular-nums text-muted-foreground">
            {executions.length} recent {executions.length === 1 ? 'run' : 'runs'}
          </span>
        )}
      </summary>

      <div className="border-t border-border px-4 py-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock3 className="h-4 w-4 animate-pulse motion-reduce:animate-none" />
            Loading execution history...
          </div>
        )}
        {isError && (
          <p className="text-sm text-destructive" role="alert">
            Execution history could not be loaded. Try reopening this section.
          </p>
        )}
        {!isLoading && !isError && (!executions || executions.length === 0) && (
          <p className="text-sm text-muted-foreground">
            This rule has not run yet. Its trigger history will appear here.
          </p>
        )}
        {executions && executions.length > 0 && (
          <ol className="divide-y divide-border border border-border bg-background">
            {executions.map((execution) => {
              const event =
                typeof execution.triggeredBy?.event === 'string'
                  ? execution.triggeredBy.event
                  : 'automation event';
              return (
                <li
                  key={execution.id}
                  className="grid gap-3 px-3 py-3 sm:grid-cols-[auto_1fr_auto] sm:items-start"
                >
                  {execution.success ? (
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 text-green-600"
                      aria-label="Succeeded"
                    />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 text-destructive" aria-label="Failed" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {event}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {execution.actionsExecuted.length}{' '}
                        {execution.actionsExecuted.length === 1 ? 'action' : 'actions'} executed
                      </span>
                    </p>
                    {execution.error && (
                      <p className="mt-1 break-words text-sm text-destructive">{execution.error}</p>
                    )}
                  </div>
                  <time
                    dateTime={execution.triggeredAt}
                    className="whitespace-nowrap text-xs tabular-nums text-muted-foreground"
                    title={new Date(execution.triggeredAt).toLocaleString()}
                  >
                    {formatRelativeTime(execution.triggeredAt)}
                  </time>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </details>
  );
}

export function formatRelativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return 'Unknown time';
  const difference = Date.now() - timestamp;
  if (difference < 60_000) return 'Just now';
  const minutes = Math.floor(difference / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}
