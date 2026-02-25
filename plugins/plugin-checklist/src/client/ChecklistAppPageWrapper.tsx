import { useState, useEffect } from 'react';
import { CheckSquare, Square, ListChecks } from 'lucide-react';

interface PluginApi {
  get<T = unknown>(path: string, params?: Record<string, string>): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  put<T = unknown>(path: string, body?: unknown): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown): Promise<T>;
  delete<T = unknown>(path: string): Promise<T>;
}

interface ChecklistItemWithIssue {
  id: string;
  subject: string;
  is_done: boolean;
  position: number;
  issue_key: string;
  issue_title: string;
  updated_at: string;
}

interface ChecklistAppPageWrapperProps {
  pluginContext: { api: PluginApi };
}

export function ChecklistAppPageWrapper({ pluginContext }: ChecklistAppPageWrapperProps) {
  const [items, setItems] = useState<ChecklistItemWithIssue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    pluginContext.api
      .get<ChecklistItemWithIssue[]>('/checklists')
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pluginContext]);

  const pendingItems = items.filter((i) => !i.is_done);
  const doneItems = items.filter((i) => i.is_done);

  if (loading) {
    return (
      <div>
        <p className="text-sm text-muted-foreground">Loading checklists...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <ListChecks className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Checklists</h1>
        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold">
          {pendingItems.length} pending
        </span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
          <ListChecks className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            No checklist items yet. Add checklists to issues to see them here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {pendingItems.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Pending ({pendingItems.length})
              </h2>
              <div className="rounded-lg border border-border bg-card divide-y divide-border">
                {pendingItems.map((item) => (
                  <ChecklistRow key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}

          {doneItems.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Completed ({doneItems.length})
              </h2>
              <div className="rounded-lg border border-border bg-card divide-y divide-border">
                {doneItems.map((item) => (
                  <ChecklistRow key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function ChecklistRow({ item }: { item: ChecklistItemWithIssue }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {item.is_done ? (
        <CheckSquare className="h-4 w-4 shrink-0 text-green-600" />
      ) : (
        <Square className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <span className={`flex-1 text-sm ${item.is_done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
        {item.subject}
      </span>
      <a
        href={`/issues/${item.issue_key}`}
        className="shrink-0 text-xs font-medium text-primary hover:underline"
      >
        {item.issue_key}
      </a>
      <span className="shrink-0 text-xs text-muted-foreground" title={item.issue_title}>
        {item.issue_title.length > 40 ? item.issue_title.slice(0, 40) + '...' : item.issue_title}
      </span>
    </div>
  );
}
