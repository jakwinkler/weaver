import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CalendarCheck,
  CircleDot,
  Clock,
  EyeOff,
  Link2,
  Merge,
  Plus,
  RefreshCw,
  Save,
  Scissors,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { formatDraftTime, formatMinutes, todayLocalDate } from './date';
import type {
  AutomaticTimeApi,
  AutomaticTimeDraft,
  AutomaticTimeTimelineStatus,
  IssueCandidate,
} from './types';

function toDateTimeInput(timestamp: string): string {
  const date = new Date(timestamp);
  const local = new Date(date.valueOf() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoTimestamp(value: string): string {
  return new Date(value).toISOString();
}

function TimelineStatus({ status }: { status: AutomaticTimeTimelineStatus | null }) {
  if (!status) return null;
  const content = {
    active: {
      title: 'Companion active',
      detail: 'Current activity is still being finalized privately. New drafts refresh here.',
      icon: <CircleDot className="h-4 w-4 text-emerald-600" />,
      className: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    },
    stale: {
      title: 'Companion updates delayed',
      detail: 'The last heartbeat is stale. Synced drafts are safe and this timeline will retry.',
      icon: <CircleDot className="h-4 w-4 text-amber-600" />,
      className: 'border-amber-200 bg-amber-50 text-amber-900',
    },
    offline: {
      title: 'Companion offline',
      detail: 'Synced drafts remain private and available. Queued companion drafts will retry.',
      icon: <WifiOff className="h-4 w-4" />,
      className: 'border-border bg-muted/50 text-foreground',
    },
    unpaired: {
      title: 'No companion paired',
      detail: 'You can still add offline work, or pair the macOS companion in Settings.',
      icon: <WifiOff className="h-4 w-4" />,
      className: 'border-border bg-muted/50 text-foreground',
    },
  }[status.state];

  return (
    <div className={`mb-4 flex items-start gap-3 rounded-lg border p-3 ${content.className}`}>
      <span className="mt-0.5">{content.icon}</span>
      <div>
        <div className="text-sm font-semibold">{content.title}</div>
        <div className="text-xs opacity-80">{content.detail}</div>
      </div>
    </div>
  );
}

function DraftEditor({
  draft,
  candidates,
  api,
  selected,
  onSelected,
  onChanged,
}: {
  draft: AutomaticTimeDraft;
  candidates: IssueCandidate[];
  api: AutomaticTimeApi;
  selected: boolean;
  onSelected: (selected: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const [minutes, setMinutes] = useState(String(draft.proposedMinutes));
  const [description, setDescription] = useState(draft.description);
  const [startedAt, setStartedAt] = useState(() => toDateTimeInput(draft.startedAt));
  const [endedAt, setEndedAt] = useState(() => toDateTimeInput(draft.endedAt));
  const [splitAt, setSplitAt] = useState(() =>
    toDateTimeInput(
      new Date(
        (new Date(draft.startedAt).valueOf() + new Date(draft.endedAt).valueOf()) / 2,
      ).toISOString(),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (busy) return;
    setMinutes(String(draft.proposedMinutes));
    setDescription(draft.description);
    setStartedAt(toDateTimeInput(draft.startedAt));
    setEndedAt(toDateTimeInput(draft.endedAt));
  }, [busy, draft]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await onChanged();
    } catch {
      setError('This draft could not be changed. Your private draft is unchanged.');
    } finally {
      setBusy(false);
    }
  };

  const editable = draft.status === 'draft';
  const confidence = `${Math.round(draft.confidence * 100)}% confidence`;

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelected(event.target.checked)}
            disabled={!editable || busy}
            aria-label={`Select draft ${draft.description}`}
            className="mt-1 h-4 w-4 rounded border-input"
          />
          <div>
            <div className="text-sm font-semibold text-foreground">
              {formatDraftTime(draft.startedAt)} to {formatDraftTime(draft.endedAt)}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{formatMinutes(draft.proposedMinutes)} proposed</span>
              <span>·</span>
              <span>{confidence}</span>
              <span>·</span>
              <span>{draft.draftType}</span>
            </div>
          </div>
        </div>
        <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
          {draft.status}
        </span>
      </div>

      <details className="mt-3 rounded-md border border-border/70 bg-muted/20 px-3 py-2">
        <summary className="cursor-pointer text-xs font-semibold text-foreground">
          Why this issue?
        </summary>
        <div className="mt-2 space-y-2 text-xs text-muted-foreground">
          <p>
            {draft.assignmentMethod} · ruleset {draft.rulesetVersion}
          </p>
          {draft.assignmentReasons.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {draft.assignmentReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : (
            <p>No matching evidence was strong enough to explain an assignment.</p>
          )}
          {draft.assignmentAlternatives.length > 0 && editable && (
            <div>
              <p className="font-medium text-foreground">Alternatives</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {draft.assignmentAlternatives.map((alternative) => (
                  <button
                    key={alternative.issueKey}
                    type="button"
                    onClick={() => run(() => api.assignDraft(draft.id, alternative.issueKey))}
                    disabled={busy}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                  >
                    {alternative.issueKey} · {Math.round(alternative.confidence * 100)}%
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </details>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_110px]">
        <label className="text-xs font-medium text-muted-foreground">
          Description
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={!editable || busy}
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
            disabled={!editable || busy}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-muted-foreground">
          Start
          <input
            type="datetime-local"
            value={startedAt}
            onChange={(event) => setStartedAt(event.target.value)}
            disabled={!editable || busy}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
          />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          End
          <input
            type="datetime-local"
            value={endedAt}
            onChange={(event) => setEndedAt(event.target.value)}
            disabled={!editable || busy}
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
            disabled={!editable || busy}
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
          {draft.issueKey && (
            <Link
              to={`/issues/${draft.issueKey}`}
              aria-label={`Open ${draft.issueKey}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
            >
              <Link2 className="h-4 w-4" />
            </Link>
          )}
          <button
            type="button"
            onClick={() =>
              run(() =>
                api.editDraft(draft.id, {
                  proposedMinutes: Number(minutes),
                  description,
                  startedAt: toIsoTimestamp(startedAt),
                  endedAt: toIsoTimestamp(endedAt),
                }),
              )
            }
            disabled={!editable || busy || Number(minutes) < 1 || !startedAt || !endedAt}
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
            disabled={!editable || busy}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <EyeOff className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Delete draft"
            title="Delete draft"
            onClick={() => run(() => api.deleteDraft(draft.id))}
            disabled={draft.status === 'released' || draft.status === 'superseded' || busy}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {editable && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            Split draft
          </summary>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-muted-foreground">
              Split at
              <input
                type="datetime-local"
                value={splitAt}
                onChange={(event) => setSplitAt(event.target.value)}
                className="mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              />
            </label>
            <button
              type="button"
              onClick={() => run(() => api.splitDraft(draft.id, toIsoTimestamp(splitAt)))}
              disabled={busy || !splitAt}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-sm font-medium text-foreground disabled:opacity-50"
            >
              <Scissors className="h-4 w-4" />
              Confirm split
            </button>
          </div>
        </details>
      )}
    </article>
  );
}

export function AutomaticTimeDraftsPage({ api }: { api: AutomaticTimeApi }) {
  const [searchParams] = useSearchParams();
  const [date, setDate] = useState(() => searchParams.get('date') ?? todayLocalDate());
  const [drafts, setDrafts] = useState<AutomaticTimeDraft[]>([]);
  const [candidates, setCandidates] = useState<IssueCandidate[]>([]);
  const [timelineStatus, setTimelineStatus] = useState<AutomaticTimeTimelineStatus | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showOffline, setShowOffline] = useState(false);
  const [offlineStart, setOfflineStart] = useState(`${date}T09:00`);
  const [offlineEnd, setOfflineEnd] = useState(`${date}T09:30`);
  const [offlineMinutes, setOfflineMinutes] = useState('30');
  const [offlineDescription, setOfflineDescription] = useState('');
  const [offlineIssueKey, setOfflineIssueKey] = useState('');

  const load = useCallback(
    async (background = false) => {
      if (!background) setLoading(true);
      setError('');
      try {
        const [nextDrafts, nextCandidates, nextStatus] = await Promise.all([
          api.listDrafts(date),
          api.listIssueCandidates(),
          api.getTimelineStatus(),
        ]);
        setDrafts(nextDrafts);
        setCandidates(nextCandidates);
        setTimelineStatus(nextStatus);
      } catch {
        setError(
          background
            ? 'Live refresh failed. Existing private drafts remain available.'
            : 'Private drafts could not be loaded. Retry when Weaver is reachable.',
        );
      } finally {
        if (!background) setLoading(false);
      }
    },
    [api, date],
  );

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(true), 15_000);
    return () => window.clearInterval(interval);
  }, [load]);

  useEffect(() => {
    setSelected(new Set());
    setOfflineStart(`${date}T09:00`);
    setOfflineEnd(`${date}T09:30`);
  }, [date]);

  const visibleDrafts = useMemo(
    () => drafts.filter((draft) => draft.status !== 'superseded'),
    [drafts],
  );
  const selectedIds = visibleDrafts
    .filter((draft) => selected.has(draft.id))
    .map((draft) => draft.id);

  const mergeSelected = async () => {
    setBusy(true);
    setError('');
    try {
      await api.mergeDrafts(selectedIds);
      setSelected(new Set());
      await load(true);
    } catch {
      setError('Selected drafts could not be merged. Only adjacent private drafts can merge.');
    } finally {
      setBusy(false);
    }
  };

  const addOffline = async () => {
    setBusy(true);
    setError('');
    try {
      await api.addOfflineDraft({
        localDate: date,
        startedAt: toIsoTimestamp(offlineStart),
        endedAt: toIsoTimestamp(offlineEnd),
        proposedMinutes: Number(offlineMinutes),
        description: offlineDescription,
        ...(offlineIssueKey ? { issueKey: offlineIssueKey } : {}),
      });
      setShowOffline(false);
      setOfflineDescription('');
      await load(true);
    } catch {
      setError('Offline work could not be added. Check the interval and try again.');
    } finally {
      setBusy(false);
    }
  };

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
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            aria-label="Draft date"
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
          <button
            type="button"
            onClick={() => setShowOffline((value) => !value)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-foreground"
          >
            <Plus className="h-4 w-4" />
            Add offline work
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

      <TimelineStatus status={timelineStatus} />

      {showOffline && (
        <section className="mb-4 rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">Add private offline work</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs font-medium text-muted-foreground">
              Offline start
              <input
                type="datetime-local"
                value={offlineStart}
                onChange={(event) => setOfflineStart(event.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Offline end
              <input
                type="datetime-local"
                value={offlineEnd}
                onChange={(event) => setOfflineEnd(event.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Offline minutes
              <input
                type="number"
                min={1}
                max={1440}
                value={offlineMinutes}
                onChange={(event) => setOfflineMinutes(event.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Offline description
              <input
                value={offlineDescription}
                onChange={(event) => setOfflineDescription(event.target.value)}
                maxLength={500}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Offline issue
              <select
                value={offlineIssueKey}
                onChange={(event) => setOfflineIssueKey(event.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
              >
                <option value="">Leave unassigned</option>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.key}>
                    {candidate.key} · {candidate.summary}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={() => void addOffline()}
            disabled={
              busy ||
              !offlineStart ||
              !offlineEnd ||
              !offlineDescription.trim() ||
              Number(offlineMinutes) < 1
            }
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add private draft
          </button>
        </section>
      )}

      {selectedIds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-sm text-foreground">{selectedIds.length} adjacent drafts selected</p>
          <button
            type="button"
            onClick={() => void mergeSelected()}
            disabled={selectedIds.length < 2 || busy}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Merge className="h-4 w-4" />
            Merge selected
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading private drafts...</p>
      ) : visibleDrafts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-14 text-center">
          <Clock className="mx-auto h-9 w-9 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium text-foreground">No drafts for this day</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Derived companion activity and offline work will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleDrafts.map((draft) => (
            <DraftEditor
              key={draft.id}
              draft={draft}
              candidates={candidates}
              api={api}
              selected={selected.has(draft.id)}
              onSelected={(value) =>
                setSelected((current) => {
                  const next = new Set(current);
                  if (value) next.add(draft.id);
                  else next.delete(draft.id);
                  return next;
                })
              }
              onChanged={() => load(true)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
