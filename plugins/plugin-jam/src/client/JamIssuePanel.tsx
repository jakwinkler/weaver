import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Activity, Bug, Link2Off, Play } from 'lucide-react';
import { JamCard } from './JamCard';
import { RecordingRequests } from './RecordingRequests';
import { buttonClass, errorMessage, inputClass, primaryButtonClass } from './format';
import type { IssueJamsResponse, JamSummary, LinkedJam, PluginComponentContext } from './types';

interface JamIssuePanelProps {
  pluginContext: PluginComponentContext;
  issueKey: string;
}

const BACKLINK_LABELS: Record<string, string> = {
  posted: 'Linked back in Jam',
  pending: 'Jam comment pending',
  failed: 'Jam comment failed',
};

const SOURCE_LABELS: Record<string, string> = {
  recording_request: 'Recorded for a request',
  rule: 'Created by a routing rule',
};

export function JamIssuePanel({ pluginContext, issueKey }: JamIssuePanelProps) {
  const api = pluginContext.api;
  const [data, setData] = useState<IssueJamsResponse | null>(null);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<IssueJamsResponse>(`/issues/${issueKey}/jams`));
    } catch (loadError) {
      setError(errorMessage(loadError, 'Could not load Jams'));
      setData({
        items: [],
        display: { showDebugSummary: false, embedPlayer: false, recordingRequests: false },
      });
    }
  }, [api, issueKey]);

  useEffect(() => {
    setData(null);
    setError(null);
    void load();
  }, [load]);

  const attach = async (event: FormEvent) => {
    event.preventDefault();
    if (!link.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/issues/${issueKey}/jams`, { jamUrl: link.trim() });
      setLink('');
      await load();
    } catch (attachError) {
      setError(errorMessage(attachError, 'Could not attach the Jam'));
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (jamId: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/issues/${issueKey}/jams/${jamId}`);
      await load();
    } catch (unlinkError) {
      setError(errorMessage(unlinkError, 'Could not unlink the Jam'));
    } finally {
      setBusy(false);
    }
  };

  const jams = data?.items ?? null;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Bug className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Jams</h3>
        {jams && jams.length > 0 && (
          <span className="text-xs text-muted-foreground">{jams.length}</span>
        )}
      </div>

      {jams === null ? (
        <p className="text-sm text-muted-foreground">Loading Jams...</p>
      ) : (
        jams.map((jam) => (
          <LinkedJamCard
            key={jam.jamId}
            jam={jam}
            issueKey={issueKey}
            pluginContext={pluginContext}
            display={data!.display}
            busy={busy}
            onUnlink={() => void unlink(jam.jamId)}
          />
        ))
      )}

      <form onSubmit={attach} className="flex items-center gap-2">
        <input
          className={inputClass}
          value={link}
          onChange={(event) => setLink(event.target.value)}
          placeholder="Paste a Jam link, such as https://jam.dev/c/..."
          aria-label="Jam link"
        />
        <button type="submit" className={primaryButtonClass} disabled={busy || !link.trim()}>
          Attach
        </button>
      </form>
      {error && <p className="text-xs text-destructive">{error}</p>}

      {data?.display.recordingRequests && (
        <RecordingRequests pluginContext={pluginContext} issueKey={issueKey} onChange={load} />
      )}
    </section>
  );
}

interface LinkedJamCardProps {
  jam: LinkedJam;
  issueKey: string;
  pluginContext: PluginComponentContext;
  display: IssueJamsResponse['display'];
  busy: boolean;
  onUnlink: () => void;
}

function LinkedJamCard({
  jam,
  issueKey,
  pluginContext,
  display,
  busy,
  onUnlink,
}: LinkedJamCardProps) {
  const [summary, setSummary] = useState<JamSummary | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const toggleSummary = async () => {
    const opening = !summaryOpen;
    setSummaryOpen(opening);
    if (!opening || summary) return;
    setSummaryError(null);
    try {
      setSummary(
        await pluginContext.api.get<JamSummary>(`/issues/${issueKey}/jams/${jam.jamId}/summary`),
      );
    } catch (loadError) {
      setSummaryError(errorMessage(loadError, 'Summary unavailable'));
    }
  };

  const status = [SOURCE_LABELS[jam.link.source], BACKLINK_LABELS[jam.link.backlinkState]]
    .filter(Boolean)
    .join(' · ');
  return (
    <JamCard
      jam={jam}
      actions={
        <>
          {display.embedPlayer && jam.type !== 'screenshot' && (
            <button
              type="button"
              className={buttonClass}
              onClick={() => setPlaying(!playing)}
              title="Play here"
            >
              <Play className="h-3.5 w-3.5" />
              {playing ? 'Hide' : 'Play'}
            </button>
          )}
          {display.showDebugSummary && (
            <button
              type="button"
              className={buttonClass}
              onClick={() => void toggleSummary()}
              title="Debug summary"
            >
              <Activity className="h-3.5 w-3.5" />
              Summary
            </button>
          )}
          <button
            type="button"
            className={buttonClass}
            onClick={onUnlink}
            disabled={busy}
            title="Unlink this Jam"
          >
            <Link2Off className="h-3.5 w-3.5" />
            Unlink
          </button>
        </>
      }
    >
      {status && <p className="mt-1 text-xs text-muted-foreground">{status}</p>}
      {playing && (
        // Jam's player renders only Jams shared with anyone who has the link (spike S6).
        <div className="mt-2 aspect-video w-full overflow-hidden rounded-md border border-border">
          <iframe
            src={`https://jam.dev/mini/${jam.jamId}`}
            title={jam.title ?? 'Jam recording'}
            className="h-full w-full"
            allow="fullscreen"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
      {summaryOpen && (
        <div className="mt-2 rounded-md border border-border bg-background p-2 text-xs">
          {summaryError ? (
            <p className="text-destructive">{summaryError}</p>
          ) : !summary ? (
            <p className="text-muted-foreground">Loading summary from Jam...</p>
          ) : (
            <SummaryView summary={summary} />
          )}
        </div>
      )}
    </JamCard>
  );
}

function SummaryView({ summary }: { summary: JamSummary }) {
  const levels = Object.entries(summary.console.levels)
    .map(([level, count]) => `${count} ${level}`)
    .join(', ');
  return (
    <div className="space-y-2">
      <p className="text-foreground">
        Console:{' '}
        {summary.console.total ? levels || `${summary.console.total} messages` : 'no messages'}.
        Network: {summary.network.total} requests, {summary.network.failed} failed.
      </p>
      {summary.console.errors.length > 0 && (
        <ul className="space-y-1">
          {summary.console.errors.map((entry, index) => (
            <li key={index} className="break-words font-mono text-destructive">
              {entry.message}
            </li>
          ))}
        </ul>
      )}
      {summary.network.failures.length > 0 && (
        <ul className="space-y-1">
          {summary.network.failures.map((request, index) => (
            <li key={index} className="break-all font-mono text-foreground">
              {request.status ?? '?'} {request.method} {request.host}
              {request.path}
              {request.durationMs !== null ? ` (${request.durationMs} ms)` : ''}
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground">
        From Jam, checked {new Date(summary.fetchedAt).toLocaleTimeString()}. Request bodies,
        headers, and query strings are not shown; open the Jam for full logs.
      </p>
    </div>
  );
}
