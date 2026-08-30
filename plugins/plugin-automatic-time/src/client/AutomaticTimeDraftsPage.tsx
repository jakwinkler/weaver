import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarCheck, Clock, EyeOff, RefreshCw, Save, Trash2 } from 'lucide-react';
import { formatDraftTime, formatMinutes, todayLocalDate } from './date';
import type { AutomaticTimeApi, AutomaticTimeDraft, IssueCandidate } from './types';

function DraftEditor({
  draft,
  candidates,
  api,
  onChanged,
}: {
  draft: AutomaticTimeDraft;
  candidates: IssueCandidate[];
  api: AutomaticTimeApi;
  onChanged: () => Promise<void>;
}) {
  const [minutes, setMinutes] = useState(String(draft.proposedMinutes));
  const [description, setDescription] = useState(draft.description);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">
            {formatDraftTime(draft.startedAt)} to {formatDraftTime(draft.endedAt)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {formatMinutes(draft.proposedMinutes)} proposed
            {draft.assignmentReasons[0] ? ` · ${draft.assignmentReasons[0]}` : ''}
          </div>
        </div>
        <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
          {draft.status}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_110px]">
        <label className="text-xs font-medium text-muted-foreground">
          Description
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={draft.status !== 'draft' || busy}
            maxLength={500}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
          />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Minutes
          <input
            type="number"
            min={1}
            max={1440}
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            disabled={draft.status !== 'draft' || busy}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <label className="text-xs font-medium text-muted-foreground">
          Weaver issue
          <select
            value={draft.issueKey ?? ''}
            onChange={(event) =>
              event.target.value && run(() => api.assignDraft(draft.id, event.target.value))
            }
            disabled={draft.status !== 'draft' || busy}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="">Choose an issue</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.key}>
                {candidate.key} · {candidate.summary}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() =>
              run(() =>
                api.editDraft(draft.id, {
                  proposedMinutes: Number(minutes),
                  description,
                }),
              )
            }
            disabled={draft.status !== 'draft' || busy || Number(minutes) < 1}
            className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Save
          </button>
          <button
            type="button"
            aria-label="Hide draft"
            title="Hide draft"
            onClick={() => run(() => api.hideDraft(draft.id))}
            disabled={draft.status !== 'draft' || busy}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <EyeOff className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Delete draft"
            title="Delete draft"
            onClick={() => run(() => api.deleteDraft(draft.id))}
            disabled={draft.status === 'released' || busy}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

export function AutomaticTimeDraftsPage({ api }: { api: AutomaticTimeApi }) {
  const [searchParams] = useSearchParams();
  const [date, setDate] = useState(() => searchParams.get('date') ?? todayLocalDate());
  const [drafts, setDrafts] = useState<AutomaticTimeDraft[]>([]);
  const [candidates, setCandidates] = useState<IssueCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextDrafts, nextCandidates] = await Promise.all([
        api.listDrafts(date),
        api.listIssueCandidates(),
      ]);
      setDrafts(nextDrafts);
      setCandidates(nextCandidates);
    } catch {
      setError('Private drafts could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [api, date]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Clock className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Drafts</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Private until you review and release them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          />
          <button
            type="button"
            aria-label="Refresh drafts"
            onClick={() => void load()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <Link
            to={`/apps/automatic-time/review?date=${date}`}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            <CalendarCheck className="h-4 w-4" />
            Daily Review
          </Link>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}
      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading private drafts...</p>
      ) : drafts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-14 text-center">
          <Clock className="mx-auto h-9 w-9 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium text-foreground">No drafts for this day</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Derived activity from the companion will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {drafts.map((draft) => (
            <DraftEditor
              key={draft.id}
              draft={draft}
              candidates={candidates}
              api={api}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}
