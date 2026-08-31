import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AutomaticTimeDraftsPage,
  AutomaticTimeReviewPage,
  AutomaticTimeSettingsPage,
  type AutomaticTimeApi,
  type AutomaticTimeDraft,
  type AutomaticTimeCorrectionMemory,
  type AutomaticTimeLocalAlphaMetrics,
  type AutomaticTimeReview,
} from '@weaver/plugin-automatic-time';

const draft: AutomaticTimeDraft = {
  id: 'draft-1',
  sourceReference: 'synthetic-draft-1',
  draftType: 'captured',
  localDate: '2026-08-29',
  startedAt: '2026-08-29T13:00:00.000Z',
  endedAt: '2026-08-29T13:45:00.000Z',
  proposedMinutes: 45,
  description: 'Synthetic automatic-time draft',
  issueKey: null,
  confidence: 0.82,
  assignmentMethod: 'synthetic-fixture',
  assignmentReasons: ['Recent Weaver issue activity'],
  assignmentAlternatives: [
    { issueKey: 'ATP-2', confidence: 0.62, reasons: ['Repository mapping also matched'] },
  ],
  rulesetVersion: 'synthetic-fixture-v1',
  status: 'draft',
  releasedAt: null,
};

function createApi(): AutomaticTimeApi {
  return {
    listDrafts: vi.fn().mockResolvedValue([draft]),
    getTimelineStatus: vi.fn().mockResolvedValue({
      state: 'active',
      deviceId: 'device-1',
      displayName: "Matt's Mac",
      lastSeenAt: '2026-08-29T13:44:30.000Z',
      lastDraftAt: '2026-08-29T13:44:00.000Z',
      refreshAfterSeconds: 15,
    }),
    listIssueCandidates: vi.fn().mockResolvedValue([
      {
        id: 'issue-1',
        key: 'ATP-1',
        summary: 'Review automatic time',
        projectKey: 'ATP',
        statusCategory: 'in_progress',
      },
      {
        id: 'issue-2',
        key: 'ATP-2',
        summary: 'Alternative automatic time issue',
        projectKey: 'ATP',
        statusCategory: 'in_progress',
      },
    ]),
    editDraft: vi.fn().mockResolvedValue(draft),
    assignDraft: vi.fn().mockResolvedValue({ ...draft, issueKey: 'ATP-1' }),
    hideDraft: vi.fn().mockResolvedValue({ ...draft, status: 'hidden' }),
    deleteDraft: vi.fn().mockResolvedValue(undefined),
    splitDraft: vi.fn().mockResolvedValue([]),
    mergeDrafts: vi.fn().mockResolvedValue(draft),
    addOfflineDraft: vi.fn().mockResolvedValue(draft),
    getDailyReview: vi.fn(),
    previewRelease: vi.fn(),
    releaseDay: vi.fn(),
    reopenDay: vi.fn(),
    getPairingRequest: vi.fn(),
    approvePairingRequest: vi.fn(),
    listDevices: vi.fn().mockResolvedValue([]),
    revokeDevice: vi.fn(),
    listCorrectionMemories: vi.fn().mockResolvedValue([]),
    updateCorrectionMemory: vi.fn(),
    recomputeCorrectionMemory: vi.fn(),
    deleteCorrectionMemory: vi.fn(),
    getLocalAlphaMetrics: vi.fn().mockResolvedValue({
      privateLocalMetric: true,
      firstLocalDate: null,
      lastLocalDate: null,
      workingDayCount: 0,
      capturedMinutes: 0,
      capturedDraftCount: 0,
      releasedDraftCount: 0,
      acceptedSuggestionCount: 0,
      reassignedDraftCount: 0,
      unmatchedDraftCount: 0,
      rejectedOrDeletedCount: 0,
      destinationAccuracy: 0,
      correctionRate: 0,
      unmatchedRate: 0,
      medianReviewSeconds: null,
      manualTimerEntryCount: 0,
      manualEntryCount: 0,
      meetsAccuracyTarget: false,
      meetsReviewTarget: false,
      alphaComplete: false,
    }),
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Automatic Time plugin pages', () => {
  it('inspects, reverses, and recomputes correction memory with private alpha metrics', async () => {
    const api = createApi();
    const memory: AutomaticTimeCorrectionMemory = {
      id: 'memory-1',
      memoryType: 'private-context-digest',
      normalizedFeatures: { contextDigest: `sha256:${'a'.repeat(64)}` },
      targetProjectKey: null,
      targetIssueKey: 'ATL-2',
      weight: 1.25,
      positiveCount: 3,
      negativeCount: 1,
      enabled: true,
      explanation: 'Private context confirmed for ATL-2',
      lastAppliedAt: '2026-08-31T13:00:00.000Z',
      updatedAt: '2026-08-31T13:00:00.000Z',
    };
    const metrics: AutomaticTimeLocalAlphaMetrics = {
      privateLocalMetric: true,
      firstLocalDate: '2026-08-31',
      lastLocalDate: '2026-08-31',
      workingDayCount: 1,
      capturedMinutes: 30,
      capturedDraftCount: 1,
      releasedDraftCount: 1,
      acceptedSuggestionCount: 0,
      reassignedDraftCount: 1,
      unmatchedDraftCount: 0,
      rejectedOrDeletedCount: 0,
      destinationAccuracy: 0,
      correctionRate: 1,
      unmatchedRate: 0,
      medianReviewSeconds: 90,
      manualTimerEntryCount: 1,
      manualEntryCount: 0,
      meetsAccuracyTarget: false,
      meetsReviewTarget: true,
      alphaComplete: false,
    };
    vi.mocked(api.listCorrectionMemories).mockResolvedValue([memory]);
    vi.mocked(api.getLocalAlphaMetrics).mockResolvedValue(metrics);
    vi.mocked(api.updateCorrectionMemory).mockResolvedValue({
      ...memory,
      enabled: false,
      recomputeRevision: 1,
      affectedDraftCount: 1,
    });
    vi.mocked(api.recomputeCorrectionMemory).mockResolvedValue({
      ...memory,
      recomputeRevision: 2,
      affectedDraftCount: 1,
    });
    vi.mocked(api.deleteCorrectionMemory).mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={['/apps/automatic-time/settings']}>
        <AutomaticTimeSettingsPage api={api} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Private local alpha')).toBeTruthy();
    expect(screen.getByText('1 of 10 working days')).toBeTruthy();
    expect(screen.getByText('90s median review')).toBeTruthy();
    expect(screen.getByText('1 manual timer entry')).toBeTruthy();
    expect(screen.getByText('ATL-2')).toBeTruthy();
    expect(
      screen.getByText((content) => content.startsWith('3 confirmations · 1 rejection')),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Disable memory for ATL-2' }));
    await waitFor(() => expect(api.updateCorrectionMemory).toHaveBeenCalledWith('memory-1', false));
    fireEvent.click(screen.getByRole('button', { name: 'Recompute drafts for ATL-2' }));
    await waitFor(() => expect(api.recomputeCorrectionMemory).toHaveBeenCalledWith('memory-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete memory for ATL-2' }));
    await waitFor(() => expect(api.deleteCorrectionMemory).toHaveBeenCalledWith('memory-1'));
  });

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
      expect(api.editDraft).toHaveBeenCalledWith(
        'draft-1',
        expect.objectContaining({
          proposedMinutes: 50,
          description: 'Reviewed automatic-time draft',
        }),
      ),
    );

    fireEvent.change(screen.getByLabelText('Weaver issue'), { target: { value: 'ATP-1' } });
    await waitFor(() => expect(api.assignDraft).toHaveBeenCalledWith('draft-1', 'ATP-1'));
  });

  it('shows live confidence details and supports merge plus offline work', async () => {
    const api = createApi();
    const secondDraft = {
      ...draft,
      id: 'draft-2',
      sourceReference: 'synthetic-draft-2',
      startedAt: '2026-08-29T13:45:00.000Z',
      endedAt: '2026-08-29T14:15:00.000Z',
      proposedMinutes: 30,
      description: 'Second synthetic draft',
    };
    vi.mocked(api.listDrafts).mockResolvedValue([draft, secondDraft]);

    render(
      <MemoryRouter initialEntries={['/apps/automatic-time/drafts?date=2026-08-29']}>
        <AutomaticTimeDraftsPage api={api} />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Companion active/)).toBeTruthy();
    expect(screen.getAllByText('82% confidence')).toHaveLength(2);
    fireEvent.click(screen.getAllByText('Why this issue?')[0]);
    expect(screen.getAllByText('Recent Weaver issue activity')).toHaveLength(2);

    fireEvent.click(screen.getByLabelText('Select draft Synthetic automatic-time draft'));
    fireEvent.click(screen.getByLabelText('Select draft Second synthetic draft'));
    fireEvent.click(screen.getByRole('button', { name: 'Merge selected' }));
    await waitFor(() => expect(api.mergeDrafts).toHaveBeenCalledWith(['draft-1', 'draft-2']));

    fireEvent.click(screen.getByRole('button', { name: 'Add offline work' }));
    fireEvent.change(screen.getByLabelText('Offline start'), {
      target: { value: '2026-08-29T15:00' },
    });
    fireEvent.change(screen.getByLabelText('Offline end'), {
      target: { value: '2026-08-29T15:20' },
    });
    fireEvent.change(screen.getByLabelText('Offline minutes'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Offline description'), {
      target: { value: 'Synthetic offline planning' },
    });
    fireEvent.change(screen.getByLabelText('Offline issue'), { target: { value: 'ATP-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add private draft' }));

    await waitFor(() =>
      expect(api.addOfflineDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          localDate: '2026-08-29',
          proposedMinutes: 20,
          description: 'Synthetic offline planning',
          issueKey: 'ATP-1',
        }),
      ),
    );
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
      capturedTotalMinutes: 50,
      hiddenTotalMinutes: 0,
      proposedTotalMinutes: 50,
      reportedTotalMinutes: 50,
      manualAdjustmentMinutes: 0,
      officialEntryCount: 0,
      lockedEntryCount: 0,
      canReopen: false,
      drafts: [{ ...draft, issueKey: 'ATP-1', proposedMinutes: 50 }],
    };
    vi.mocked(api.getDailyReview).mockResolvedValue(review);
    vi.mocked(api.previewRelease).mockResolvedValue({
      capturedTotalMinutes: 50,
      hiddenTotalMinutes: 0,
      proposedTotalMinutes: 50,
      reportedTotalMinutes: 50,
      manualAdjustmentMinutes: 0,
      entries: [
        {
          draftId: 'draft-1',
          issueKey: 'ATP-1',
          sourceReference: 'synthetic-draft-1',
          minutes: 50,
          proposedMinutes: 50,
          description: 'Synthetic automatic-time draft',
          startedAt: draft.startedAt,
          endedAt: draft.endedAt,
        },
      ],
    });
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

    fireEvent.click(await screen.findByRole('button', { name: 'Preview official entries' }));
    expect(await screen.findByText('Exact official entries')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm release 50m' }));
    await waitFor(() =>
      expect(api.releaseDay).toHaveBeenCalledWith(
        '2026-08-29',
        'automatic-time:user-1:2026-08-29',
        50,
      ),
    );
    expect(await screen.findByText('Day released')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Release 0m' })).toBeNull();
    expect(screen.getAllByText('released').length).toBeGreaterThan(0);
  });

  it('moves through Daily Review by keyboard and chooses a numbered alternative', async () => {
    const api = createApi();
    vi.mocked(api.getDailyReview).mockResolvedValue({
      localDate: '2026-08-29',
      ready: true,
      releasableDraftCount: 2,
      hiddenDraftCount: 0,
      unresolvedDraftCount: 0,
      releasedDraftCount: 0,
      releaseStatus: null,
      capturedTotalMinutes: 75,
      hiddenTotalMinutes: 0,
      proposedTotalMinutes: 75,
      reportedTotalMinutes: 75,
      manualAdjustmentMinutes: 0,
      officialEntryCount: 0,
      lockedEntryCount: 0,
      canReopen: false,
      drafts: [
        { ...draft, issueKey: 'ATP-1' },
        {
          ...draft,
          id: 'draft-2',
          sourceReference: 'synthetic-draft-2',
          description: 'Second review card',
          issueKey: 'ATP-1',
          assignmentAlternatives: [],
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={['/apps/automatic-time/review?date=2026-08-29']}>
        <AutomaticTimeReviewPage api={api} currentUserId="user-1" />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Synthetic automatic-time draft')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(await screen.findByText('Second review card')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: '1' });
    await waitFor(() => expect(api.assignDraft).toHaveBeenCalledWith('draft-1', 'ATP-2'));
  });

  it.each([
    ['stale', 'Companion updates delayed'],
    ['offline', 'Companion offline'],
  ] as const)('shows the %s companion state with an empty timeline', async (state, message) => {
    const api = createApi();
    vi.mocked(api.listDrafts).mockResolvedValue([]);
    vi.mocked(api.getTimelineStatus).mockResolvedValue({
      state,
      deviceId: 'device-1',
      displayName: "Matt's Mac",
      lastSeenAt: '2026-08-29T12:00:00.000Z',
      lastDraftAt: null,
      refreshAfterSeconds: 15,
    });

    render(
      <MemoryRouter initialEntries={['/apps/automatic-time/drafts?date=2026-08-29']}>
        <AutomaticTimeDraftsPage api={api} />
      </MemoryRouter>,
    );

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByText('No drafts for this day')).toBeTruthy();
  });

  it('keeps loading and failure states explicit', async () => {
    const loadingApi = createApi();
    vi.mocked(loadingApi.listDrafts).mockReturnValue(new Promise(() => {}));
    const loadingView = render(
      <MemoryRouter>
        <AutomaticTimeDraftsPage api={loadingApi} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Loading private drafts...')).toBeTruthy();
    loadingView.unmount();

    const failedApi = createApi();
    vi.mocked(failedApi.listDrafts).mockRejectedValue(new Error('offline'));
    render(
      <MemoryRouter>
        <AutomaticTimeDraftsPage api={failedApi} />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText(
        'Private drafts could not be loaded. Retry when Weaver is reachable.',
      ),
    ).toBeTruthy();
  });

  it('explains a partially locked day and prevents reopen', async () => {
    const api = createApi();
    vi.mocked(api.getDailyReview).mockResolvedValue({
      localDate: '2026-08-29',
      ready: false,
      releasableDraftCount: 0,
      hiddenDraftCount: 0,
      unresolvedDraftCount: 0,
      releasedDraftCount: 1,
      releaseStatus: 'partially_locked',
      capturedTotalMinutes: 50,
      hiddenTotalMinutes: 0,
      proposedTotalMinutes: 50,
      reportedTotalMinutes: 50,
      manualAdjustmentMinutes: 0,
      officialEntryCount: 1,
      lockedEntryCount: 1,
      canReopen: false,
      drafts: [{ ...draft, issueKey: 'ATP-1', status: 'released' }],
    });

    render(
      <MemoryRouter initialEntries={['/apps/automatic-time/review?date=2026-08-29']}>
        <AutomaticTimeReviewPage api={api} currentUserId="user-1" />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Day contains locked official time')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Locked day cannot reopen' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('explicitly reopens an unlocked released day', async () => {
    const api = createApi();
    vi.mocked(api.getDailyReview).mockResolvedValue({
      localDate: '2026-08-29',
      ready: false,
      releasableDraftCount: 0,
      hiddenDraftCount: 0,
      unresolvedDraftCount: 0,
      releasedDraftCount: 1,
      releaseStatus: 'released',
      capturedTotalMinutes: 50,
      hiddenTotalMinutes: 0,
      proposedTotalMinutes: 50,
      reportedTotalMinutes: 50,
      manualAdjustmentMinutes: 0,
      officialEntryCount: 1,
      lockedEntryCount: 0,
      canReopen: true,
      drafts: [{ ...draft, issueKey: 'ATP-1', status: 'released' }],
    });
    vi.mocked(api.reopenDay).mockResolvedValue({ status: 'reopened', reopenedDraftCount: 1 });

    render(
      <MemoryRouter initialEntries={['/apps/automatic-time/review?date=2026-08-29']}>
        <AutomaticTimeReviewPage api={api} currentUserId="user-1" />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Reopen private drafts' }));
    await waitFor(() => expect(api.reopenDay).toHaveBeenCalledWith('2026-08-29'));
  });

  it('offers to resume an interrupted reopen', async () => {
    const api = createApi();
    vi.mocked(api.getDailyReview).mockResolvedValue({
      localDate: '2026-08-29',
      ready: false,
      releasableDraftCount: 0,
      hiddenDraftCount: 0,
      unresolvedDraftCount: 0,
      releasedDraftCount: 1,
      releaseStatus: 'reopening',
      capturedTotalMinutes: 50,
      hiddenTotalMinutes: 0,
      proposedTotalMinutes: 50,
      reportedTotalMinutes: 50,
      manualAdjustmentMinutes: 0,
      officialEntryCount: 1,
      lockedEntryCount: 0,
      canReopen: true,
      drafts: [{ ...draft, issueKey: 'ATP-1', status: 'released' }],
    });
    vi.mocked(api.reopenDay).mockResolvedValue({ status: 'reopened', reopenedDraftCount: 1 });

    render(
      <MemoryRouter initialEntries={['/apps/automatic-time/review?date=2026-08-29']}>
        <AutomaticTimeReviewPage api={api} currentUserId="user-1" />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Reopen is ready to resume')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue reopening private drafts' }));
    await waitFor(() => expect(api.reopenDay).toHaveBeenCalledWith('2026-08-29'));
  });

  it('shows exact pairing authority and revokes a companion device', async () => {
    const api = createApi();
    vi.mocked(api.getPairingRequest).mockResolvedValue({
      userCode: 'ABCD-1234',
      displayName: "Matt's Mac",
      platform: 'macos',
      companionVersion: '0.1.0',
      requestedScopes: [
        'automatic-time:candidates:read',
        'automatic-time:drafts:write',
        'automatic-time:device:heartbeat',
      ],
      status: 'pending',
      expiresAt: '2026-08-29T20:00:00.000Z',
    });
    vi.mocked(api.approvePairingRequest).mockResolvedValue({ status: 'approved' });
    vi.mocked(api.listDevices).mockResolvedValue([
      {
        id: 'device-1',
        displayName: "Matt's Mac",
        platform: 'macos',
        companionVersion: '0.1.0',
        scopes: ['automatic-time:drafts:write'],
        status: 'active',
        lastSeenAt: '2026-08-29T19:55:00.000Z',
        expiresAt: '2026-11-27T19:55:00.000Z',
        revokedAt: null,
      },
    ]);
    vi.mocked(api.revokeDevice).mockResolvedValue({ status: 'revoked' });

    render(
      <MemoryRouter initialEntries={['/apps/automatic-time/settings?pairing=ABCD-1234']}>
        <AutomaticTimeSettingsPage api={api} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Matt's Mac wants to pair")).toBeTruthy();
    expect(screen.getByText('Cannot release official time')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approve device' }));
    await waitFor(() => expect(api.approvePairingRequest).toHaveBeenCalledWith('ABCD-1234'));

    fireEvent.click(await screen.findByRole('button', { name: "Revoke Matt's Mac" }));
    await waitFor(() => expect(api.revokeDevice).toHaveBeenCalledWith('device-1'));
  });
});
