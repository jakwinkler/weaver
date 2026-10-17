import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleAlert, Copy, RefreshCw } from 'lucide-react';
import { buttonClass, errorMessage, isForbidden, primaryButtonClass, relativeTime } from './format';
import type { ConnectionStatus, PluginComponentContext } from './types';

interface ConnectionViewProps {
  pluginContext: PluginComponentContext;
}

export function ConnectionView({ pluginContext }: ConnectionViewProps) {
  const api = pluginContext.api;
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await api.get<ConnectionStatus>('/connection'));
    } catch (loadError) {
      if (isForbidden(loadError)) setForbidden(true);
      else setError(errorMessage(loadError, 'Could not load the connection'));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusy(false);
      await load();
    }
  };

  const verify = () =>
    run(async () => {
      const result = await api.post<{
        ok: boolean;
        workspaceMatches: boolean | null;
        backlinksPosted: number;
      }>('/connection/verify');
      if (!result.ok)
        return 'The token works, but it belongs to a different Jam workspace than the workspace ID.';
      const posted = result.backlinksPosted
        ? ` Posted ${result.backlinksPosted} pending Jam comments.`
        : '';
      return result.workspaceMatches === null
        ? `The token works. Weaver could not confirm the workspace yet because it has no Jams.${posted}`
        : `Connected to the Jam workspace.${posted}`;
    });

  const retry = () =>
    run(async () => {
      const result = await api.post<{ requeued: number; posted: number }>('/backlinks/retry');
      return `Posted ${result.posted} Jam comments.`;
    });

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (forbidden) {
    return (
      <p className="text-sm text-muted-foreground">
        Only Jam administrators can see the connection.
      </p>
    );
  }
  if (!status) {
    return error ? (
      <p className="text-sm text-destructive">{error}</p>
    ) : (
      <p className="text-sm text-muted-foreground">Loading...</p>
    );
  }

  const expiry =
    status.daysUntilExpiry === null
      ? status.accessExpiresOn
        ? 'expiry date not readable'
        : 'expiry date not recorded'
      : status.daysUntilExpiry < 0
        ? `expired on ${status.accessExpiresOn}`
        : `expires ${status.accessExpiresOn} (${status.daysUntilExpiry} days)`;
  const tokenWarning = status.daysUntilExpiry !== null && status.daysUntilExpiry <= 14;
  // Requests made before 0.3.0 add a reference to the reusable link instead of having their own.
  const older = status.olderRecordingRequests;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Status</h2>
        <ul className="space-y-2 text-sm">
          <StatusRow ok={Boolean(status.workspaceId)} label="Jam workspace ID">
            {status.workspaceId ?? 'Not set'}
          </StatusRow>
          <StatusRow ok={status.tokenConfigured && !tokenWarning} label="Access token">
            {status.tokenConfigured ? expiry : 'Not set'}
          </StatusRow>
          <StatusRow ok={status.webhookSecretConfigured} label="Webhook signing secret">
            {status.webhookSecretConfigured ? 'Set' : 'Not set'}
          </StatusRow>
          <StatusRow ok={status.tokenConfigured} label="Recording requests">
            {status.tokenConfigured
              ? 'On; each request creates its own recording link in Jam'
              : 'Off until the access token is set'}
          </StatusRow>
          {(status.recordingLinkConfigured || older.active > 0) && (
            <StatusRow ok={status.recordingLinkConfigured} label="Reusable recording link">
              {older.active > 0
                ? `${older.active} older ${older.active === 1 ? 'request uses' : 'requests use'} it until ${older.lastExpiresAt?.slice(0, 10)}${
                    status.recordingLinkConfigured ? '' : '; set it again to copy their links'
                  }`
                : 'No request uses it any more; you can clear it'}
            </StatusRow>
          )}
          <StatusRow ok={Boolean(status.lastWebhookAt)} label="Last webhook">
            {relativeTime(status.lastWebhookAt)}
          </StatusRow>
          <StatusRow
            ok={Boolean(status.lastVerifiedAt) && !status.connectionError}
            label="Last verified"
          >
            {relativeTime(status.lastVerifiedAt)}
          </StatusRow>
          {status.postBacklinkComments && (
            <StatusRow ok={status.backlinks.failed === 0} label="Jam comments">
              {status.backlinks.pending} pending, {status.backlinks.failed} failed
            </StatusRow>
          )}
        </ul>
        {status.connectionError && (
          <p className="mt-3 rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">
            {status.connectionError.message} ({relativeTime(status.connectionError.at)})
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={primaryButtonClass}
            onClick={() => void verify()}
            disabled={busy}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Verify connection
          </button>
          {status.postBacklinkComments &&
            status.backlinks.pending + status.backlinks.failed > 0 && (
              <button
                type="button"
                className={buttonClass}
                onClick={() => void retry()}
                disabled={busy}
              >
                Retry Jam comments
              </button>
            )}
          <a href="/settings/plugins" className={buttonClass}>
            Plugin settings
          </a>
        </div>
        {notice && <p className="mt-3 text-sm text-foreground">{notice}</p>}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Webhook URL</h2>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2.5 py-1.5 text-xs text-foreground">
            {status.webhookUrl}
          </code>
          <button
            type="button"
            className={buttonClass}
            onClick={() => void copy(status.webhookUrl)}
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        {status.webhookUrlIsLocal && (
          <p className="mt-2 text-xs text-destructive">
            Jam only delivers to a public HTTPS address. Set API_PUBLIC_URL to the API's public
            address, or use Sync from Jam on the inbox.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Set up</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-foreground">
          <li>
            In Jam, open Settings, then MCP, and create a personal access token with the mcp:read
            and mcp:write scopes. Note its expiry date.
          </li>
          <li>
            Copy the workspace ID from the Jam settings address: jam.dev/s/&lt;workspace
            ID&gt;/settings.
          </li>
          <li>Enter the token, its expiry date, and the workspace ID in the plugin settings.</li>
          <li>
            In Jam, open Settings, then Webhooks, then Set up. Add an endpoint with the webhook URL
            above and the jam.created event.
          </li>
          <li>
            Copy the endpoint's signing secret (whsec_...) into the plugin settings, then verify the
            connection.
          </li>
        </ol>
      </section>
    </div>
  );
}

function StatusRow({ ok, label, children }: { ok: boolean; label: string; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
      ) : (
        <CircleAlert className="h-4 w-4 shrink-0 text-amber-600" />
      )}
      <span className="w-44 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-foreground">{children}</span>
    </li>
  );
}
