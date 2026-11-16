import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleAlert, Copy, RefreshCw } from 'lucide-react';
import { buttonClass, errorMessage, isForbidden, primaryButtonClass, relativeTime } from './format';
import type { ConnectionStatus, PluginComponentContext, RecordingDomains } from './types';

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
  const [copied, setCopied] = useState<string | null>(null);
  const [domains, setDomains] = useState<RecordingDomains | null>(null);
  const [domainsError, setDomainsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await api.get<ConnectionStatus>('/connection'));
    } catch (loadError) {
      if (isForbidden(loadError)) setForbidden(true);
      else setError(errorMessage(loadError, 'Could not load the connection'));
    }
  }, [api]);

  // A separate call to Jam, so the status above still shows when Jam cannot be reached.
  const loadDomains = useCallback(async () => {
    setDomainsError(null);
    try {
      setDomains(await api.get<RecordingDomains>('/connection/recording-domains'));
    } catch (loadError) {
      setDomainsError(
        errorMessage(loadError, "Could not load the Jam workspace's connected domains"),
      );
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const tokenConfigured = status?.tokenConfigured ?? false;
  useEffect(() => {
    if (tokenConfigured) void loadDomains();
  }, [tokenConfigured, loadDomains]);

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
    setCopied(value);
    setTimeout(() => setCopied(null), 1500);
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
  const domainInUse = domains?.domains.find((domain) => domain.configured) ?? null;

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
            {!status.tokenConfigured
              ? 'Off until the access token is set'
              : status.recordingUrlId
                ? 'On; each request gets its own Jam link, recorded from the connected domain'
                : 'On; each request gets its own Jam link, which captures no logs'}
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

      {status.tokenConfigured && (
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Connected domains</h2>
            <button type="button" className={buttonClass} onClick={() => void loadDomains()}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Request links capture console and network logs only when they start from a verified
            connected domain. Copy its ID into the plugin's Connected domain for recording requests
            setting.
          </p>
          {domainsError ? (
            <p className="text-sm text-destructive">{domainsError}</p>
          ) : !domains ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : domains.domains.length === 0 ? (
            <p className="text-sm text-foreground">
              This Jam workspace has no connected domains, so request links capture no console or
              network logs.{' '}
              <a
                href="https://jam.dev/docs/custom-recording-domain"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Connect one in Jam
              </a>{' '}
              first.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {domains.domains.map((domain) => (
                <li key={domain.id} className="flex flex-wrap items-center gap-2">
                  {domain.verified ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                  ) : (
                    <CircleAlert className="h-4 w-4 shrink-0 text-amber-600" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {domain.url ?? 'No address'}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {[domain.configured && 'In use', domain.verified ? 'Verified' : 'Not verified']
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                  <code className="max-w-48 truncate rounded-md bg-muted px-2 py-0.5 text-xs text-foreground">
                    {domain.id}
                  </code>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => void copy(domain.id)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copied === domain.id ? 'Copied' : 'Copy ID'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {domains && domains.configuredId && !domainInUse && (
            <p className="mt-3 text-sm text-destructive">
              The Connected domain for recording requests setting names none of these domains.
            </p>
          )}
          {domainInUse && !domainInUse.verified && (
            <p className="mt-3 text-sm text-destructive">
              The domain in use is not verified in Jam, so its links capture no logs until it is.
            </p>
          )}
        </section>
      )}

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
            {copied === status.webhookUrl ? 'Copied' : 'Copy'}
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
          <li>
            Optionally, for console and network logs on requested recordings, copy a verified
            domain's ID from Connected domains into the plugin settings.
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
