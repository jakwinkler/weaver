import { useState, type FormEvent } from 'react';
import {
  useWebhooks,
  useCreateWebhook,
  useDeleteWebhook,
  useWebhookDeliveries,
  useTestWebhook,
} from '@/api/hooks-phase5';

const AVAILABLE_EVENTS = [
  'issue.created',
  'issue.updated',
  'issue.status_changed',
  'comment.added',
  'sprint.started',
  'sprint.completed',
];

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
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage webhook integrations for your projects.
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          {showCreateForm ? 'Cancel' : 'Add Webhook'}
        </button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Create Webhook
          </h2>

          <div className="mb-4">
            <label
              htmlFor="webhookUrl"
              className="block text-sm font-medium text-gray-700"
            >
              Payload URL
            </label>
            <input
              id="webhookUrl"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhook"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="mb-4">
            <label
              htmlFor="webhookSecret"
              className="block text-sm font-medium text-gray-700"
            >
              Secret{' '}
              <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              id="webhookSecret"
              type="text"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Used to sign webhook payloads"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="mb-4">
            <span className="block text-sm font-medium text-gray-700">
              Events
            </span>
            <p className="mb-2 text-xs text-gray-500">
              Select which events will trigger this webhook.
            </p>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_EVENTS.map((event) => (
                <button
                  key={event}
                  type="button"
                  onClick={() => toggleEvent(event)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    selectedEvents.includes(event)
                      ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {event}
                </button>
              ))}
            </div>
            {selectedEvents.length === 0 && (
              <p className="mt-1 text-xs text-red-500">
                Select at least one event.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                setUrl('');
                setSecret('');
                setSelectedEvents([]);
              }}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createWebhook.isPending || !url.trim() || selectedEvents.length === 0}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {createWebhook.isPending ? 'Creating...' : 'Create Webhook'}
            </button>
          </div>

          {createWebhook.isError && (
            <p className="mt-3 text-sm text-red-600">
              Failed to create webhook. Please try again.
            </p>
          )}
        </form>
      )}

      {/* Webhooks list */}
      {isLoading ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-8 text-center shadow-sm">
          <p className="text-sm text-gray-500">Loading webhooks...</p>
        </div>
      ) : !webhooks || webhooks.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
          <svg
            className="mx-auto h-10 w-10 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
          <p className="mt-3 text-sm text-gray-400">No webhooks configured.</p>
          <p className="text-xs text-gray-400">
            Click "Add Webhook" to get started.
          </p>
        </div>
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
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Webhook header */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-2 w-2 flex-shrink-0 rounded-full ${
                webhook.active ? 'bg-green-400' : 'bg-gray-300'
              }`}
            />
            <p className="truncate text-sm font-medium text-gray-900">
              {webhook.url}
            </p>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {webhook.events.map((event) => (
              <span
                key={event}
                className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
              >
                {event}
              </span>
            ))}
          </div>
        </div>

        <div className="ml-4 flex flex-shrink-0 items-center gap-2">
          <button
            onClick={onTest}
            disabled={isTesting}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            title="Send test payload"
          >
            {isTesting ? 'Testing...' : 'Test'}
          </button>
          <button
            onClick={onToggleExpand}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            {isExpanded ? 'Hide Log' : 'Delivery Log'}
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Delivery log */}
      {isExpanded && <DeliveryLog webhookId={webhook.id} />}
    </div>
  );
}

function DeliveryLog({ webhookId }: { webhookId: string }) {
  const { data: deliveries, isLoading } = useWebhookDeliveries(webhookId);

  return (
    <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Recent Deliveries
      </h4>

      {isLoading ? (
        <p className="text-xs text-gray-500">Loading deliveries...</p>
      ) : !deliveries || deliveries.length === 0 ? (
        <p className="text-xs text-gray-400">No deliveries recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {deliveries.map((delivery) => (
            <div
              key={delivery.id}
              className="flex items-center justify-between rounded-md bg-white px-4 py-2 text-xs"
            >
              <div className="flex items-center gap-3">
                {delivery.success ? (
                  <svg
                    className="h-4 w-4 text-green-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-4 w-4 text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                )}
                <span className="font-medium text-gray-700">
                  {delivery.event}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 font-mono ${
                    delivery.success
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {delivery.responseStatus}
                </span>
              </div>
              <span className="text-gray-400">
                {new Date(delivery.deliveredAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
