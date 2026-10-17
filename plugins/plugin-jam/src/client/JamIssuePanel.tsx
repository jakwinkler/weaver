import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Bug, Link2Off } from 'lucide-react';
import { JamCard } from './JamCard';
import { buttonClass, errorMessage, inputClass, primaryButtonClass } from './format';
import type { LinkedJam, PluginComponentContext } from './types';

interface JamIssuePanelProps {
  pluginContext: PluginComponentContext;
  issueKey: string;
}

const BACKLINK_LABELS: Record<string, string> = {
  posted: 'Linked back in Jam',
  pending: 'Jam comment pending',
  failed: 'Jam comment failed',
};

export function JamIssuePanel({ pluginContext, issueKey }: JamIssuePanelProps) {
  const api = pluginContext.api;
  const [jams, setJams] = useState<LinkedJam[] | null>(null);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ items: LinkedJam[] }>(`/issues/${issueKey}/jams`);
      setJams(data.items);
    } catch (loadError) {
      setError(errorMessage(loadError, 'Could not load Jams'));
      setJams([]);
    }
  }, [api, issueKey]);

  useEffect(() => {
    setJams(null);
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
          <JamCard
            key={jam.jamId}
            jam={jam}
            actions={
              <button
                type="button"
                className={buttonClass}
                onClick={() => void unlink(jam.jamId)}
                disabled={busy}
                title="Unlink this Jam"
              >
                <Link2Off className="h-3.5 w-3.5" />
                Unlink
              </button>
            }
          >
            {BACKLINK_LABELS[jam.link.backlinkState] && (
              <p className="mt-1 text-xs text-muted-foreground">
                {BACKLINK_LABELS[jam.link.backlinkState]}
              </p>
            )}
          </JamCard>
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
    </section>
  );
}
