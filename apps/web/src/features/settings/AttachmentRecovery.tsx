import { useState } from 'react';
import type { ImportJob, JiraAuth } from '@weaver/shared';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AttachmentRecovery({
  job,
  onStarted,
}: {
  job: ImportJob;
  onStarted: (id: string) => void;
}) {
  const failures = job.errors.filter((error) => error.itemType === 'attachment' && error.itemId);
  const [selected, setSelected] = useState<string[]>([]);
  const [email, setEmail] = useState('');
  const [secret, setSecret] = useState('');
  const [authType, setAuthType] = useState<JiraAuth['type']>('api_token');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (!failures.length) return null;
  return (
    <form
      className="space-y-3 rounded border p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(false);
        try {
          const response = await apiClient.post<ImportJob>(
            `/import/jira/retry-attachments/${job.id}`,
            {
              attachmentIds: selected,
              config: {
                source: job.source,
                baseUrl: job.sourceUrl,
                auth:
                  authType === 'oauth'
                    ? { type: 'oauth', accessToken: secret }
                    : { type: 'api_token', token: secret, email },
              },
            },
          );
          setSecret('');
          onStarted(response.data.id);
        } catch {
          setError(true);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h4 className="font-medium">Retry selected attachments</h4>
      <p className="text-sm">
        Supply fresh credentials for {job.sourceUrl}. Weaver checks current Jira access before
        recovering these files. The original report is retained.
      </p>
      {[...new Map(failures.map((failure) => [failure.itemId!, failure])).values()].map(
        (failure) => (
          <label key={failure.itemId} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(failure.itemId!)}
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? [...selected, failure.itemId!]
                    : selected.filter((id) => id !== failure.itemId),
                )
              }
            />
            {failure.issueKey} {failure.filename ?? `Attachment ${failure.itemId}`}
          </label>
        ),
      )}
      <label className="block text-sm">
        Authentication
        <select
          className="ml-2 rounded border p-2"
          value={authType}
          onChange={(event) => setAuthType(event.target.value as JiraAuth['type'])}
        >
          <option value="api_token">API token</option>
          <option value="oauth">OAuth access token</option>
        </select>
      </label>
      {authType === 'api_token' && (
        <label className="block text-sm">
          Jira email
          <Input
            type="email"
            autoComplete="username"
            value={email}
            required={job.source === 'jira_cloud'}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
      )}
      <label className="block text-sm">
        Jira token
        <Input
          type="password"
          autoComplete="off"
          value={secret}
          required
          onChange={(event) => setSecret(event.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          Recovery could not start. Check credentials and ensure no other import is running.
        </p>
      )}
      <Button type="submit" disabled={busy || !selected.length || !secret}>
        {busy
          ? 'Starting recovery…'
          : `Retry ${selected.length} attachment${selected.length === 1 ? '' : 's'}`}
      </Button>
    </form>
  );
}
