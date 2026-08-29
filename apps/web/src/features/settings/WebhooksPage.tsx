import { useState, type FormEvent } from 'react';
import { Link2, Check, X, ChevronRight } from 'lucide-react';
import {
  useWebhooks,
  useCreateWebhook,
  useDeleteWebhook,
  useWebhookDeliveries,
  useTestWebhook,
} from '@/api/hooks-phase5';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const EVENT_EXAMPLES: Record<string, Record<string, unknown>> = {
  'issue.created': { issueKey: 'PROJ-42', projectKey: 'PROJ', summary: 'Fix login bug', priority: 'high', assigneeId: 'user-uuid' },
  'issue.updated': { issueKey: 'PROJ-42', fields: { summary: 'Updated title', priority: 'medium' } },
  'issue.bulk_updated': { issueIds: ['issue-uuid-1', 'issue-uuid-2'], issueKeys: ['PROJ-42', 'PROJ-43'], updates: { priority: 'high' }, count: 2 },
  'issue.deleted': { issueKey: 'PROJ-42' },
  'issue.bulk_deleted': { issueIds: ['issue-uuid-1', 'issue-uuid-2'], issueKeys: ['PROJ-42', 'PROJ-43'], count: 2 },
  'issue.status_changed': { issueKey: 'PROJ-42', projectKey: 'PROJ', fromStatus: 'status-uuid-1', toStatus: 'status-uuid-2' },
  'issue.assigned': { issueKey: 'PROJ-42', assigneeId: 'new-user-uuid', previousAssigneeId: 'old-user-uuid' },
  'comment.added': { issueKey: 'PROJ-42', commentId: 'comment-uuid', authorId: 'user-uuid' },
  'comment.updated': { issueKey: 'PROJ-42', commentId: 'comment-uuid', authorId: 'user-uuid' },
  'comment.deleted': { issueKey: 'PROJ-42', commentId: 'comment-uuid' },
  'project.created': { projectKey: 'PROJ', name: 'My Project', leadUserId: 'user-uuid' },
  'project.updated': { projectKey: 'PROJ', fields: { name: 'Renamed Project' } },
  'project.deleted': { projectKey: 'PROJ' },
  'sprint.started': { sprintId: 'sprint-uuid', name: 'Sprint 1', boardId: 'board-uuid' },
  'sprint.completed': { sprintId: 'sprint-uuid', name: 'Sprint 1', boardId: 'board-uuid' },
  'time.logged': { issueKey: 'PROJ-42', minutes: 120, description: 'Backend work', userId: 'user-uuid' },
};

const AVAILABLE_EVENTS = Object.keys(EVENT_EXAMPLES);

export function WebhooksPage() {
  const { data: webhooks, isLoading } = useWebhooks();
  const createWebhook = useCreateWebhook();
  const deleteWebhook = useDeleteWebhook();
  const testWebhook = useTestWebhook();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [expandedWebhookId, setExpandedWebhookId] = useState<string | null>(null);

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event)
        ? prev.filter((e) => e !== event)
        : [...prev, event],
    );
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim() || selectedEvents.length === 0) return;

    await createWebhook.mutateAsync({
      url: url.trim(),
      events: selectedEvents,
      secret: secret.trim() || undefined,
    });

    setUrl('');
    setSecret('');
    setSelectedEvents([]);
    setShowCreateForm(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this webhook?')) return;
    await deleteWebhook.mutateAsync(id);
  };

  const handleTest = async (id: string) => {
    await testWebhook.mutateAsync(id);
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Webhooks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage webhook integrations for your projects.
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          {showCreateForm ? 'Cancel' : 'Add Webhook'}
        </Button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Create Webhook</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="webhookUrl">Payload URL</Label>
                <Input
                  id="webhookUrl"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/webhook"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="webhookSecret">
                  Secret{' '}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="webhookSecret"
                  type="text"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="Used to sign webhook payloads"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Events</Label>
                <p className="text-xs text-muted-foreground">
                  Select which events will trigger this webhook. Click an event to see its example payload.
                </p>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_EVENTS.map((event) => (
                    <button
                      key={event}
                      type="button"
                      onClick={() => toggleEvent(event)}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                        selectedEvents.includes(event)
                          ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80',
                      )}
                    >
                      {event}
                    </button>
                  ))}
                </div>
                {selectedEvents.length === 0 && (
                  <p className="text-xs text-destructive">
                    Select at least one event.
                  </p>
                )}
                {selectedEvents.length > 0 && (
                  <EventPayloadPreview events={selectedEvents} />
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreateForm(false);
                    setUrl('');
                    setSecret('');
                    setSelectedEvents([]);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createWebhook.isPending || !url.trim() || selectedEvents.length === 0}
                >
                  {createWebhook.isPending ? 'Creating...' : 'Create Webhook'}
                </Button>
              </div>

              {createWebhook.isError && (
                <p className="text-sm text-destructive">
                  Failed to create webhook. Please try again.
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      {/* Webhooks list */}
      {isLoading ? (
        <Card>
          <CardContent className="px-6 py-8 text-center">
            <p className="text-sm text-muted-foreground">Loading webhooks...</p>
          </CardContent>
        </Card>
      ) : !webhooks || webhooks.length === 0 ? (
        <Card>
          <CardContent className="px-6 py-12 text-center">
            <Link2 className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">No webhooks configured.</p>
            <p className="text-xs text-muted-foreground">
              Click "Add Webhook" to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {webhooks.map((webhook) => (
            <WebhookCard
              key={webhook.id}
              webhook={webhook}
              isExpanded={expandedWebhookId === webhook.id}
              onToggleExpand={() =>
                setExpandedWebhookId(
                  expandedWebhookId === webhook.id ? null : webhook.id,
                )
              }
              onDelete={() => handleDelete(webhook.id)}
              onTest={() => handleTest(webhook.id)}
              isDeleting={deleteWebhook.isPending}
              isTesting={testWebhook.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface WebhookCardProps {
  webhook: {
    id: string;
    url: string;
    events: string[];
    active: boolean;
    createdAt: string;
  };
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  onTest: () => void;
  isDeleting: boolean;
  isTesting: boolean;
}

function WebhookCard({
  webhook,
  isExpanded,
  onToggleExpand,
  onDelete,
  onTest,
  isDeleting,
  isTesting,
}: WebhookCardProps) {
  return (
    <Card>
      {/* Webhook header */}
      <CardContent className="flex items-center justify-between px-6 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'inline-flex h-2 w-2 flex-shrink-0 rounded-full',
                webhook.active ? 'bg-green-400' : 'bg-muted-foreground/40',
              )}
            />
            <p className="truncate text-sm font-medium text-foreground">
              {webhook.url}
            </p>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {webhook.events.map((event) => (
              <Badge key={event} variant="secondary" className="rounded-full text-xs font-medium">
                {event}
              </Badge>
            ))}
          </div>
        </div>

        <div className="ml-4 flex flex-shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onTest}
            disabled={isTesting}
            title="Send test payload"
          >
            {isTesting ? 'Testing...' : 'Test'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleExpand}
          >
            {isExpanded ? 'Hide Log' : 'Delivery Log'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            disabled={isDeleting}
            className="border-destructive/30 text-destructive hover:bg-destructive/10"
          >
            Delete
          </Button>
        </div>
      </CardContent>

      {/* Delivery log */}
      {isExpanded && <DeliveryLog webhookId={webhook.id} />}
    </Card>
  );
}

function DeliveryLog({ webhookId }: { webhookId: string }) {
  const { data: deliveries, isLoading } = useWebhookDeliveries(webhookId);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="border-t border-border bg-muted/50 px-6 py-4">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Recent Deliveries
      </h4>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading deliveries...</p>
      ) : !deliveries || deliveries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No deliveries recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {deliveries.map((delivery) => (
            <div key={delivery.id}>
              <button
                type="button"
                onClick={() => setExpandedId(expandedId === delivery.id ? null : delivery.id)}
                className="flex w-full items-center justify-between rounded-md bg-card px-4 py-2 text-xs hover:bg-accent/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <ChevronRight
                    className={cn(
                      'h-3.5 w-3.5 text-muted-foreground transition-transform',
                      expandedId === delivery.id && 'rotate-90',
                    )}
                  />
                  {delivery.success ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <X className="h-4 w-4 text-destructive" />
                  )}
                  <span className="font-medium text-foreground">
                    {delivery.event}
                  </span>
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 font-mono',
                      delivery.success
                        ? 'bg-green-100 text-green-700'
                        : 'bg-destructive/10 text-destructive',
                    )}
                  >
                    {delivery.response_status ?? '—'}
                  </span>
                </div>
                <span className="text-muted-foreground">
                  {new Date(delivery.delivered_at).toLocaleString()}
                </span>
              </button>
              {expandedId === delivery.id && (
                <div className="ml-7 mt-1 mb-1 rounded-md bg-card border border-border">
                  <div className="px-4 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Payload</p>
                    <pre className="text-xs text-foreground overflow-x-auto whitespace-pre-wrap break-all font-mono bg-muted/50 rounded p-2">
                      {JSON.stringify(delivery.payload, null, 2)}
                    </pre>
                  </div>
                  {delivery.response_body && (
                    <div className="border-t border-border px-4 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Response</p>
                      <pre className="text-xs text-foreground overflow-x-auto whitespace-pre-wrap break-all font-mono bg-muted/50 rounded p-2 max-h-32 overflow-y-auto">
                        {delivery.response_body}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EventPayloadPreview({ events }: { events: string[] }) {
  const [activeEvent, setActiveEvent] = useState(events[0]);

  // Keep activeEvent in sync if the selected event gets deselected
  const current = events.includes(activeEvent) ? activeEvent : events[0];

  return (
    <div className="mt-3 rounded-lg border border-border bg-card">
      <div className="flex items-center gap-1 border-b border-border px-3 py-1.5 overflow-x-auto">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mr-2 shrink-0">
          Example payloads
        </span>
        {events.map((event) => (
          <button
            key={event}
            type="button"
            onClick={() => setActiveEvent(event)}
            className={cn(
              'rounded px-2 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors',
              event === current
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {event}
          </button>
        ))}
      </div>
      <pre className="p-3 text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap">
        {JSON.stringify(EVENT_EXAMPLES[current] ?? {}, null, 2)}
      </pre>
    </div>
  );
}
