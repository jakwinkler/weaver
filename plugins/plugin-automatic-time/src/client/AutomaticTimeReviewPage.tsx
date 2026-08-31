import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Check,
  CheckCircle2,
  Clock,
  EyeOff,
  Lock,
  Merge,
  RotateCcw,
  Save,
  Scissors,
  Trash2,
} from 'lucide-react';
import { formatDraftTime, formatMinutes, todayLocalDate } from './date';
import type {
  AutomaticTimeApi,
  AutomaticTimeDraft,
  AutomaticTimeReleasePreview,
  AutomaticTimeReleaseResult,
  AutomaticTimeReview,
  IssueCandidate,
} from './types';

function toDateTimeInput(timestamp: string): string {
  const date = new Date(timestamp);
  const local = new Date(date.valueOf() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function ReviewCard({
  draft,
  nextDraft,
  candidates,
  api,
  busy,
  onChanged,
  onKeep,
}: {
  draft: AutomaticTimeDraft;
  nextDraft: AutomaticTimeDraft | null;
  candidates: IssueCandidate[];
  api: AutomaticTimeApi;
  busy: boolean;
  onChanged: (action: () => Promise<unknown>, advance?: boolean) => Promise<void>;
  onKeep: () => void;
}) {
  const [description, setDescription] = useState(draft.description);
  const [minutes, setMinutes] = useState(String(draft.proposedMinutes));
  const [splitAt, setSplitAt] = useState(() =>
    toDateTimeInput(
      new Date(
        (new Date(draft.startedAt).valueOf() + new Date(draft.endedAt).valueOf()) / 2,
      ).toISOString(),
    ),
  );

  useEffect(() => {
    setDescription(draft.description);
    setMinutes(String(draft.proposedMinutes));
    setSplitAt(
      toDateTimeInput(
        new Date(
          (new Date(draft.startedAt).valueOf() + new Date(draft.endedAt).valueOf()) / 2,
        ).toISOString(),
      ),
    );
  }, [draft]);

  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {formatDraftTime(draft.startedAt)} to {formatDraftTime(draft.endedAt)} ·{' '}
            {draft.draftType}
          </div>
          <h2 className="mt-1 text-lg font-semibold text-foreground">{draft.description}</h2>
          <div className="mt-1 text-sm text-muted-foreground">
            {formatMinutes(draft.proposedMinutes)} · {Math.round(draft.confidence * 100)}%
            confidence
          </div>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            draft.issueKey ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {draft.issueKey ?? 'Needs an issue'}
        </span>
      </div>

      <details className="mt-4 rounded-md border border-border/70 bg-muted/20 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-foreground">
          Why this issue?
        </summary>
        <div className="mt-2 space-y-2 text-sm text-muted-foreground">
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
            <p>No assignment evidence was strong enough.</p>
          )}
        </div>
      </details>

      {draft.assignmentAlternatives.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Alternatives · press 1 to {Math.min(9, draft.assignmentAlternatives.length)}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {draft.assignmentAlternatives.slice(0, 9).map((alternative, index) => (
              <button
                key={alternative.issueKey}
                type="button"
                onClick={() =>
                  void onChanged(() => api.assignDraft(draft.id, alternative.issueKey), true)
                }
                disabled={busy}
                className="rounded-md border border-border px-3 py-2 text-sm text-foreground disabled:opacity-50"
              >
                {index + 1}. {alternative.issueKey} · {Math.round(alternative.confidence * 100)}%
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
        <label className="text-xs font-medium text-muted-foreground">
          Rename
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
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
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="text-xs font-medium text-muted-foreground">
          Search another issue
          <select
            value={draft.issueKey ?? ''}
            onChange={(event) =>
              event.target.value &&
              void onChanged(() => api.assignDraft(draft.id, event.target.value), true)
            }
            disabled={busy}
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
        <button
          type="button"
          onClick={() =>
            void onChanged(() =>
              api.editDraft(draft.id, {
                proposedMinutes: Number(minutes),
                description,
              }),
            )
          }
          disabled={busy || Number(minutes) < 1}
          className="inline-flex h-9 self-end items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-foreground disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          Save edits
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={onKeep}
          disabled={busy || !draft.issueKey}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          Keep and next
          <span className="text-xs opacity-70">Enter</span>
        </button>
        <button
          type="button"
          onClick={() => void onChanged(() => api.hideDraft(draft.id))}
          disabled={busy}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-foreground disabled:opacity-50"
        >
          <EyeOff className="h-4 w-4" />
          Hide
          <span className="text-xs text-muted-foreground">H</span>
        </button>
        <button
          type="button"
          onClick={() => void onChanged(() => api.deleteDraft(draft.id))}
          disabled={busy}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-destructive disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
        {nextDraft && (
          <button
            type="button"
            onClick={() => void onChanged(() => api.mergeDrafts([draft.id, nextDraft.id]))}
            disabled={busy}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-foreground disabled:opacity-50"
          >
            <Merge className="h-4 w-4" />
            Merge with next
          </button>
        )}
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          Split this draft
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
            onClick={() =>
              void onChanged(() => api.splitDraft(draft.id, new Date(splitAt).toISOString()))
            }
            disabled={busy || !splitAt}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-foreground disabled:opacity-50"
          >
            <Scissors className="h-4 w-4" />
            Confirm split
          </button>
        </div>
      </details>
    </article>
  );
}

export function AutomaticTimeReviewPage({
  api,
  currentUserId,
}: {
  api: AutomaticTimeApi;
  currentUserId: string;
}) {
  const [searchParams] = useSearchParams();
  const date = searchParams.get('date') ?? todayLocalDate();
  const [review, setReview] = useState<AutomaticTimeReview | null>(null);
  const [candidates, setCandidates] = useState<IssueCandidate[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [reportedTotal, setReportedTotal] = useState('0');
  const [preview, setPreview] = useState<AutomaticTimeReleasePreview | null>(null);
  const [release, setRelease] = useState<AutomaticTimeReleaseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const idempotencyKey = useMemo(
    () => `automatic-time:${currentUserId}:${date}`,
    [currentUserId, date],
  );
  const isReleased =
    release?.batch.status === 'released' ||
    review?.releaseStatus === 'released' ||
    review?.releaseStatus === 'reopening' ||
    review?.releaseStatus === 'partially_locked';

  const load = useCallback(
    async (initial = false) => {
      if (initial) setLoading(true);
      setError('');
      try {
        const [nextReview, nextCandidates] = await Promise.all([
          api.getDailyReview(date),
          api.listIssueCandidates(),
        ]);
        setReview(nextReview);
        setCandidates(nextCandidates);
        setReportedTotal(String(nextReview.reportedTotalMinutes));
        setPreview(null);
        const draftCount = nextReview.drafts.filter((draft) => draft.status === 'draft').length;
        setActiveIndex((current) => Math.max(0, Math.min(current, draftCount - 1)));
      } catch {
        setError('Daily Review could not be loaded. Your private drafts remain unchanged.');
      } finally {
        if (initial) setLoading(false);
      }
    },
    [api, date],
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  const reviewDrafts = useMemo(
    () => review?.drafts.filter((draft) => draft.status === 'draft') ?? [],
    [review],
  );
  const currentDraft = reviewDrafts[activeIndex] ?? null;
  const nextDraft = reviewDrafts[activeIndex + 1] ?? null;

  const move = useCallback(
    (offset: number) => {
      setActiveIndex((current) =>
        Math.max(0, Math.min(current + offset, Math.max(0, reviewDrafts.length - 1))),
      );
    },
    [reviewDrafts.length],
  );

  const changeDraft = useCallback(
    async (action: () => Promise<unknown>, advance = false) => {
      setBusy(true);
      setError('');
      try {
        await action();
        if (advance) move(1);
        await load();
      } catch {
        setError('That review action failed. The private draft is still safe and retryable.');
      } finally {
        setBusy(false);
      }
    },
    [load, move],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return;
      if (!currentDraft || busy || isReleased) return;
      if (event.key === 'ArrowRight' || (event.key === 'Enter' && currentDraft.issueKey)) {
        event.preventDefault();
        move(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        move(-1);
      } else if (event.key.toLowerCase() === 'h') {
        event.preventDefault();
        void changeDraft(() => api.hideDraft(currentDraft.id));
      } else if (/^[1-9]$/.test(event.key)) {
        const alternative = currentDraft.assignmentAlternatives[Number(event.key) - 1];
        if (alternative) {
          event.preventDefault();
          void changeDraft(() => api.assignDraft(currentDraft.id, alternative.issueKey), true);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [api, busy, changeDraft, currentDraft, isReleased, move]);

  const previewRelease = async () => {
    setBusy(true);
    setError('');
    try {
      setPreview(await api.previewRelease(date, Number(reportedTotal)));
    } catch {
      setError('The release preview could not be prepared. No official time was created.');
    } finally {
      setBusy(false);
    }
  };

  const releaseDay = async () => {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.releaseDay(date, idempotencyKey, preview.reportedTotalMinutes);
      setRelease(result);
      await load();
    } catch {
      setError(
        'Release failed. Your private drafts remain safe and the same release can be retried.',
      );
    } finally {
      setBusy(false);
    }
  };

  const reopenDay = async () => {
    setBusy(true);
    setError('');
    try {
      await api.reopenDay(date);
      setRelease(null);
      await load();
    } catch {
      setError('This day could not be reopened. Locked official entries were not changed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Link
        to={`/apps/automatic-time/drafts?date=${date}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Drafts
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <CalendarCheck className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Daily Review</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {date} · Arrow keys move · Enter keeps · number keys choose alternatives
          </p>
        </div>
        {review && (
          <div className="text-right">
            <div className="text-2xl font-bold text-foreground">
              {formatMinutes(review.reportedTotalMinutes)}
            </div>
            <div className="text-xs text-muted-foreground">
              {isReleased ? 'released' : 'private review total'}
            </div>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {release && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5" />
          <div>
            <div className="font-semibold">Day released</div>
            <div className="text-sm">
              {release.entries.length} official time{' '}
              {release.entries.length === 1 ? 'entry' : 'entries'} recorded.
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Preparing review...</p>
      ) : review ? (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xl font-bold text-foreground">
                {formatMinutes(review.capturedTotalMinutes)}
              </div>
              <div className="text-sm text-muted-foreground">captured</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xl font-bold text-foreground">
                {formatMinutes(review.hiddenTotalMinutes)}
              </div>
              <div className="text-sm text-muted-foreground">hidden</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xl font-bold text-foreground">
                {formatMinutes(review.reportedTotalMinutes)}
              </div>
              <div className="text-sm text-muted-foreground">reported</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xl font-bold text-foreground">
                {review.manualAdjustmentMinutes > 0 ? '+' : ''}
                {formatMinutes(review.manualAdjustmentMinutes)}
              </div>
              <div className="text-sm text-muted-foreground">manual adjustment</div>
            </div>
          </div>

          {review.releaseStatus === 'partially_locked' && (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <Lock className="mt-0.5 h-5 w-5" />
              <div>
                <div className="font-semibold">Day contains locked official time</div>
                <div className="text-sm">
                  {review.lockedEntryCount} of {review.officialEntryCount} entries are locked.
                  Nothing was reopened or deleted.
                </div>
              </div>
            </div>
          )}

          {review.releaseStatus === 'reopening' && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-900">
              <div className="font-semibold">Reopen is ready to resume</div>
              <div className="text-sm">
                Continue reopening to finish restoring this day's private drafts after an
                interrupted request.
              </div>
            </div>
          )}

          {!isReleased && currentDraft && (
            <>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  Card {activeIndex + 1} of {reviewDrafts.length}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-label="Previous review card"
                    onClick={() => move(-1)}
                    disabled={activeIndex === 0}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border disabled:opacity-40"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next review card"
                    onClick={() => move(1)}
                    disabled={activeIndex >= reviewDrafts.length - 1}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border disabled:opacity-40"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <ReviewCard
                draft={currentDraft}
                nextDraft={nextDraft}
                candidates={candidates}
                api={api}
                busy={busy}
                onChanged={changeDraft}
                onKeep={() => move(1)}
              />
              <Link
                to={`/apps/automatic-time/drafts?date=${date}`}
                className="mt-3 inline-flex text-sm font-medium text-primary hover:underline"
              >
                Add offline work or edit the full timeline
              </Link>
            </>
          )}

          {!isReleased && reviewDrafts.length === 0 && (
            <div className="rounded-lg border border-dashed border-border py-10 text-center">
              <Clock className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-2 text-sm font-medium text-foreground">
                No private drafts to review
              </p>
            </div>
          )}

          {!isReleased && (
            <section className="mt-6 rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-foreground">Final release preview</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Preview the exact entries before any official time is created.
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Final reported total (minutes)
                    <input
                      type="number"
                      min={Math.max(1, review.releasableDraftCount)}
                      max={1440}
                      value={reportedTotal}
                      onChange={(event) => {
                        setReportedTotal(event.target.value);
                        setPreview(null);
                      }}
                      className="mt-1 h-9 w-40 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void previewRelease()}
                    disabled={!review.ready || busy || Number(reportedTotal) < 1}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold text-foreground disabled:opacity-50"
                  >
                    Preview official entries
                  </button>
                </div>
              </div>

              {!review.ready && (
                <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                  Assign, hide, or delete every unresolved draft before release.
                </p>
              )}

              {preview && (
                <div className="mt-4 border-t border-border pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-foreground">Exact official entries</h3>
                      <p className="text-sm text-muted-foreground">
                        {formatMinutes(preview.proposedTotalMinutes)} proposed ·{' '}
                        {formatMinutes(preview.reportedTotalMinutes)} reported · adjustment{' '}
                        {preview.manualAdjustmentMinutes > 0 ? '+' : ''}
                        {formatMinutes(preview.manualAdjustmentMinutes)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void releaseDay()}
                      disabled={busy}
                      className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Confirm release {formatMinutes(preview.reportedTotalMinutes)}
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {preview.entries.map((entry) => (
                      <div
                        key={entry.draftId}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"
                      >
                        <div>
                          <div className="font-medium text-foreground">{entry.description}</div>
                          <div className="text-muted-foreground">{entry.issueKey}</div>
                        </div>
                        <div className="font-semibold text-foreground">
                          {formatMinutes(entry.minutes)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {isReleased && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">
                Reopening removes all associated unlocked entries as one batch, then returns their
                private drafts for review. An interrupted request can resume safely.
              </p>
              <button
                type="button"
                onClick={() => void reopenDay()}
                disabled={!review.canReopen || busy}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm font-semibold text-foreground disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                {review.canReopen
                  ? review.releaseStatus === 'reopening'
                    ? 'Continue reopening private drafts'
                    : 'Reopen private drafts'
                  : 'Locked day cannot reopen'}
              </button>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
