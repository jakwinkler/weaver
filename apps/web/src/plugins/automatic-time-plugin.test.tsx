import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import {
  AutomaticTimeDraftsPage,
  AutomaticTimeReviewPage,
  type AutomaticTimeApi,
  type AutomaticTimeDraft,
  type AutomaticTimeReview,
} from '@weaver/plugin-automatic-time';

const draft: AutomaticTimeDraft = {
  id: 'draft-1',
  sourceReference: 'synthetic-draft-1',
  localDate: '2026-08-29',
  startedAt: '2026-08-29T13:00:00.000Z',
  endedAt: '2026-08-29T13:45:00.000Z',
  proposedMinutes: 45,
  description: 'Synthetic automatic-time draft',
  issueKey: null,
  confidence: 0.82,
  assignmentMethod: 'synthetic-fixture',
  assignmentReasons: ['Recent Weaver issue activity'],
  status: 'draft',
  releasedAt: null,
};

function createApi(): AutomaticTimeApi {
  return {
    listDrafts: vi.fn().mockResolvedValue([draft]),
    listIssueCandidates: vi.fn().mockResolvedValue([
      {
        id: 'issue-1',
        key: 'ATP-1',
        summary: 'Review automatic time',
        projectKey: 'ATP',
        statusCategory: 'in_progress',
      },
    ]),
    editDraft: vi.fn().mockResolvedValue(draft),
    assignDraft: vi.fn().mockResolvedValue({ ...draft, issueKey: 'ATP-1' }),
    hideDraft: vi.fn().mockResolvedValue({ ...draft, status: 'hidden' }),
    deleteDraft: vi.fn().mockResolvedValue(undefined),
    getDailyReview: vi.fn(),
    releaseDay: vi.fn(),
  };
}

describe('Automatic Time plugin pages', () => {
  it('lets the user edit and manually assign a private draft', async () => {
    const api = createApi();
    render(
      <MemoryRouter initialEntries={['/apps/automatic-time/drafts?date=2026-08-27']}>
        <AutomaticTimeDraftsPage api={api} />
      </MemoryRouter>,
    );

    const description = await screen.findByLabelText('Description');
    expect(api.listDrafts).toHaveBeenCalledWith('2026-08-27');
    fireEvent.change(description, { target: { value: 'Reviewed automatic-time draft' } });
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(api.editDraft).toHaveBeenCalledWith('draft-1', {
        proposedMinutes: 50,
        description: 'Reviewed automatic-time draft',
      }),
    );

    fireEvent.change(screen.getByLabelText('Weaver issue'), { target: { value: 'ATP-1' } });
    await waitFor(() => expect(api.assignDraft).toHaveBeenCalledWith('draft-1', 'ATP-1'));
  });

  it('requires an explicit Daily Review release action', async () => {
    const api = createApi();
    const review: AutomaticTimeReview = {
      localDate: '2026-08-29',
      ready: true,
      releasableDraftCount: 1,
      hiddenDraftCount: 0,
      unresolvedDraftCount: 0,
      releasedDraftCount: 0,
      releaseStatus: null,
      reportedTotalMinutes: 50,
      drafts: [{ ...draft, issueKey: 'ATP-1', proposedMinutes: 50 }],
    };
    vi.mocked(api.getDailyReview).mockResolvedValue(review);
    vi.mocked(api.releaseDay).mockResolvedValue({
      created: 1,
      entries: [{ id: 'time-entry-1' }],
      batch: {
        id: 'batch-1',
        localDate: '2026-08-29',
        status: 'released',
        reportedTotalMinutes: 50,
      },
    });

    render(
      <MemoryRouter initialEntries={['/apps/automatic-time/review?date=2026-08-29']}>
        <AutomaticTimeReviewPage api={api} currentUserId="user-1" />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Release 50m' }));
    await waitFor(() =>
      expect(api.releaseDay).toHaveBeenCalledWith('2026-08-29', 'automatic-time:user-1:2026-08-29'),
    );
    expect(await screen.findByText('Day released')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Release 0m' })).toBeNull();
    expect(screen.getAllByText('released').length).toBeGreaterThan(0);
  });
});
