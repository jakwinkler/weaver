import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Copy, Video } from 'lucide-react';
import { buttonClass, errorMessage, inputClass, primaryButtonClass, relativeTime } from './format';
import type { PluginComponentContext, RecordingRequest } from './types';

interface RecordingRequestsProps {
  pluginContext: PluginComponentContext;
  issueKey: string;
  onChange: () => Promise<void>;
}

const EXPIRY_OPTIONS = [7, 30, 90];

export function RecordingRequests({ pluginContext, issueKey, onChange }: RecordingRequestsProps) {
  const api = pluginContext.api;
  const [requests, setRequests] = useState<RecordingRequest[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState(`Recording for ${issueKey}`);
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ items: RecordingRequest[] }>(
        `/issues/${issueKey}/recording-requests`,
      );
      setRequests(data.items);
    } catch (loadError) {
      setError(errorMessage(loadError, 'Could not load recording requests'));
    }
  }, [api, issueKey]);

  useEffect(() => {
    setTitle(`Recording for ${issueKey}`);
    void load();
  }, [load, issueKey]);

  const copy = async (request: RecordingRequest) => {
    if (!request.url) return;
    await navigator.clipboard.writeText(request.url);
    setCopiedId(request.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<RecordingRequest>(`/issues/${issueKey}/recording-requests`, {
        title: title.trim(),
        expiresInDays: days,
      });
      setFormOpen(false);
      await load();
      await copy(created).catch(() => undefined);
      await onChange();
    } catch (createError) {
      setError(errorMessage(createError, 'Could not create the request'));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (requestId: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/issues/${issueKey}/recording-requests/${requestId}`);
      await load();
    } catch (revokeError) {
      setError(errorMessage(revokeError, 'Could not revoke the request'));
    } finally {
      setBusy(false);
    }
  };

  const active = requests.filter((request) => request.status === 'active');
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Recording requests</span>
        </div>
        {!formOpen && (
          <button
            type="button"
            className={buttonClass}
            onClick={() => setFormOpen(true)}
            disabled={busy}
          >
            Request a recording
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Send the link to whoever can reproduce the problem. They need no Jam account. Their
        recording attaches to this issue.
      </p>

      {formOpen && (
        <form onSubmit={create} className="flex flex-wrap items-end gap-2">
          <label className="min-w-48 flex-1 text-xs text-muted-foreground">
            Title the recorder sees
            <input
              className={inputClass}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Expires in
            <select
              className={inputClass}
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              {EXPIRY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} days
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={primaryButtonClass} disabled={busy || !title.trim()}>
            Create and copy link
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => setFormOpen(false)}
            disabled={busy}
          >
            Cancel
          </button>
        </form>
      )}

      {active.length > 0 && (
        <ul className="space-y-1.5">
          {active.map((request) => (
            <li key={request.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-foreground">{request.title}</span>
              <span className="text-muted-foreground">
                {request.jamsReceived} received · expires {relativeExpiry(request.expiresAt)}
              </span>
              <button
                type="button"
                className={buttonClass}
                onClick={() => void copy(request)}
                disabled={!request.url}
              >
                <Copy className="h-3.5 w-3.5" />
                {copiedId === request.id ? 'Copied' : 'Copy link'}
              </button>
              <button
                type="button"
                className={buttonClass}
                onClick={() => void revoke(request.id)}
                disabled={busy}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
      {requests.length > active.length && (
        <p className="text-xs text-muted-foreground">
          {requests.length - active.length} expired or revoked, most recent{' '}
          {relativeTime(requests.find((request) => request.status !== 'active')!.createdAt)}.
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function relativeExpiry(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return days <= 1 ? 'within a day' : `in ${days} days`;
}
