import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarCheck, CheckCircle2, Clock } from 'lucide-react';
import { formatDraftTime, formatMinutes, todayLocalDate } from './date';
import type { AutomaticTimeApi, AutomaticTimeReleaseResult, AutomaticTimeReview } from './types';

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
  const [release, setRelease] = useState<AutomaticTimeReleaseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState(false);
  const [error, setError] = useState('');
  const idempotencyKey = useMemo(
    () => `automatic-time:${currentUserId}:${date}`,
    [currentUserId, date],
  );
  const isReleased = release?.batch.status === 'released' || review?.releaseStatus === 'released';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setReview(await api.getDailyReview(date));
    } catch {
      setError('Daily Review could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [api, date]);

  useEffect(() => {
    void load();
  }, [load]);

  const releaseDay = async () => {
    setReleasing(true);
    setError('');
    try {
      const result = await api.releaseDay(date, idempotencyKey);
      setRelease(result);
      await load();
    } catch {
      setError(
        'Release failed. Your private drafts remain safe and the same release can be retried.',
      );
    } finally {
      setReleasing(false);
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
          <p className="mt-1 text-sm text-muted-foreground">{date}</p>
        </div>
        {review && (
          <div className="text-right">
            <div className="text-2xl font-bold text-foreground">
              {formatMinutes(review.reportedTotalMinutes)}
            </div>
            <div className="text-xs text-muted-foreground">
              {isReleased ? 'released' : 'ready to release'}
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
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
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-2xl font-bold text-foreground">
                {isReleased ? review.releasedDraftCount : review.releasableDraftCount}
              </div>
              <div className="text-sm text-muted-foreground">
                {isReleased ? 'released' : 'assigned'}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-2xl font-bold text-foreground">{review.hiddenDraftCount}</div>
              <div className="text-sm text-muted-foreground">hidden</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-2xl font-bold text-foreground">
                {review.unresolvedDraftCount}
              </div>
              <div className="text-sm text-muted-foreground">still needs a decision</div>
            </div>
          </div>

          <div className="space-y-2">
            {review.drafts.map((draft) => (
              <div
                key={draft.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium text-foreground">{draft.description}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatDraftTime(draft.startedAt)} to {formatDraftTime(draft.endedAt)} ·{' '}
                      {draft.issueKey ?? 'Unassigned'}
                    </div>
                  </div>
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {formatMinutes(draft.proposedMinutes)}
                </div>
              </div>
            ))}
          </div>

          {!isReleased && (
            <div className="mt-6 flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">
                {review.ready
                  ? 'Only this explicit action creates official time.'
                  : 'Assign, hide, or delete every unresolved draft before release.'}
              </p>
              <button
                type="button"
                onClick={() => void releaseDay()}
                disabled={!review.ready || releasing}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {releasing
                  ? 'Releasing...'
                  : `Release ${formatMinutes(review.reportedTotalMinutes)}`}
              </button>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
