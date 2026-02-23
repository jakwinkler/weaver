import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '@/api/client';
import { CheckSquare, Square, ListChecks } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

interface ChecklistItemWithIssue {
  id: string;
  subject: string;
  is_done: boolean;
  position: number;
  issue_key: string;
  issue_title: string;
  updated_at: string;
}

const PLUGIN_ID = '@weaver~plugin-checklist';

export function ChecklistAppPage() {
  const [items, setItems] = useState<ChecklistItemWithIssue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get(`/plugin-routes/${PLUGIN_ID}/checklists`)
      .then((res) => setItems(Array.isArray(res.data) ? res.data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
        <Badge variant="secondary">
          {pendingItems.length} pending
        </Badge>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="px-6 py-12 text-center">
            <ListChecks className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              No checklist items yet. Add checklists to issues to see them here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {pendingItems.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Pending ({pendingItems.length})
              </h2>
              <Card>
                <CardContent className="divide-y divide-border p-0">
                  {pendingItems.map((item) => (
                    <ChecklistRow key={item.id} item={item} />
                  ))}
                </CardContent>
              </Card>
            </section>
          )}

          {doneItems.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Completed ({doneItems.length})
              </h2>
              <Card>
                <CardContent className="divide-y divide-border p-0">
                  {doneItems.map((item) => (
                    <ChecklistRow key={item.id} item={item} />
                  ))}
                </CardContent>
              </Card>
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
      <Link
        to={`/issues/${item.issue_key}`}
        className="shrink-0 text-xs font-medium text-primary hover:underline"
      >
        {item.issue_key}
      </Link>
      <span className="shrink-0 text-xs text-muted-foreground" title={item.issue_title}>
        {item.issue_title.length > 40 ? item.issue_title.slice(0, 40) + '...' : item.issue_title}
      </span>
    </div>
  );
}
