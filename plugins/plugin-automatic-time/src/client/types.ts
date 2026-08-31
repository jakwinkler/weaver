export interface AutomaticTimeDraft {
  id: string;
  sourceReference: string;
  draftType: 'captured' | 'offline' | 'merged' | 'split';
  localDate: string;
  startedAt: string;
  endedAt: string;
  proposedMinutes: number;
  description: string;
  issueKey: string | null;
  confidence: number;
  assignmentMethod: string;
  assignmentReasons: string[];
  assignmentAlternatives: Array<{ issueKey: string; confidence: number; reasons: string[] }>;
  rulesetVersion: string;
  correctionContextDigest?: string | null;
  suggestedIssueKey?: string | null;
  status: 'draft' | 'hidden' | 'released' | 'superseded';
  releasedAt: string | null;
  updatedAt?: string;
}

export interface AutomaticTimeTimelineStatus {
  state: 'active' | 'stale' | 'offline' | 'unpaired';
  deviceId: string | null;
  displayName: string | null;
  lastSeenAt: string | null;
  lastDraftAt: string | null;
  refreshAfterSeconds: number;
}

export interface IssueCandidate {
  id: string;
  key: string;
  summary: string;
  projectKey: string;
  statusCategory: string;
}

export interface AutomaticTimeReview {
  localDate: string;
  ready: boolean;
  releasableDraftCount: number;
  hiddenDraftCount: number;
  unresolvedDraftCount: number;
  releasedDraftCount: number;
  releaseStatus: 'pending' | 'released' | 'reopening' | 'reopened' | 'partially_locked' | null;
  capturedTotalMinutes: number;
  hiddenTotalMinutes: number;
  proposedTotalMinutes: number;
  reportedTotalMinutes: number;
  manualAdjustmentMinutes: number;
  officialEntryCount: number;
  lockedEntryCount: number;
  canReopen: boolean;
  drafts: AutomaticTimeDraft[];
}

export interface AutomaticTimeReleasePreview {
  capturedTotalMinutes: number;
  hiddenTotalMinutes: number;
  proposedTotalMinutes: number;
  reportedTotalMinutes: number;
  manualAdjustmentMinutes: number;
  entries: Array<{
    draftId: string;
    issueKey: string;
    sourceReference: string;
    minutes: number;
    proposedMinutes: number;
    description: string;
    startedAt: string;
    endedAt: string;
  }>;
}

export interface AutomaticTimeReleaseResult {
  created: number;
  entries: Array<{ id: string }>;
  batch: {
    id: string;
    localDate: string;
    status: string;
    reportedTotalMinutes: number;
  };
}

export interface AutomaticTimePairingRequest {
  userCode: string;
  displayName: string;
  platform: 'macos';
  companionVersion: string;
  requestedScopes: string[];
  status: 'pending' | 'approved' | 'exchanged' | 'denied' | 'expired';
  expiresAt: string;
  approvedAt?: string | null;
}

export interface AutomaticTimeDevice {
  id: string;
  displayName: string;
  platform: 'macos';
  companionVersion: string;
  scopes: string[];
  status: 'active' | 'expired' | 'revoked';
  lastSeenAt: string | null;
  createdAt?: string;
  revokedAt: string | null;
  expiresAt: string | null;
}

export interface AutomaticTimeCorrectionMemory {
  id: string;
  memoryType: string;
  normalizedFeatures: Record<string, string>;
  targetProjectKey: string | null;
  targetIssueKey: string | null;
  weight: number;
  positiveCount: number;
  negativeCount: number;
  enabled: boolean;
  explanation: string;
  lastAppliedAt: string | null;
  updatedAt: string;
}

export interface AutomaticTimeCorrectionMemoryMutation extends AutomaticTimeCorrectionMemory {
  recomputeRevision: number;
  affectedDraftCount: number;
}

export interface AutomaticTimeLocalAlphaMetrics {
  privateLocalMetric: true;
  firstLocalDate: string | null;
  lastLocalDate: string | null;
  workingDayCount: number;
  capturedMinutes: number;
  capturedDraftCount: number;
  releasedDraftCount: number;
  acceptedSuggestionCount: number;
  reassignedDraftCount: number;
  unmatchedDraftCount: number;
  rejectedOrDeletedCount: number;
  destinationAccuracy: number;
  correctionRate: number;
  unmatchedRate: number;
  medianReviewSeconds: number | null;
  manualTimerEntryCount: number;
  manualEntryCount: number;
  meetsAccuracyTarget: boolean;
  meetsReviewTarget: boolean;
  alphaComplete: boolean;
}

export interface AutomaticTimeApi {
  listDrafts(date: string): Promise<AutomaticTimeDraft[]>;
  getTimelineStatus(): Promise<AutomaticTimeTimelineStatus>;
  listIssueCandidates(): Promise<IssueCandidate[]>;
  editDraft(
    draftId: string,
    changes: {
      proposedMinutes?: number;
      description?: string;
      startedAt?: string;
      endedAt?: string;
    },
  ): Promise<AutomaticTimeDraft>;
  assignDraft(draftId: string, issueKey: string): Promise<AutomaticTimeDraft>;
  hideDraft(draftId: string): Promise<AutomaticTimeDraft>;
  deleteDraft(draftId: string): Promise<void>;
  splitDraft(draftId: string, splitAt: string): Promise<AutomaticTimeDraft[]>;
  mergeDrafts(draftIds: string[]): Promise<AutomaticTimeDraft>;
  addOfflineDraft(input: {
    localDate: string;
    startedAt: string;
    endedAt: string;
    proposedMinutes: number;
    description: string;
    issueKey?: string;
  }): Promise<AutomaticTimeDraft>;
  getDailyReview(date: string): Promise<AutomaticTimeReview>;
  previewRelease(date: string, reportedTotalMinutes: number): Promise<AutomaticTimeReleasePreview>;
  releaseDay(
    date: string,
    idempotencyKey: string,
    reportedTotalMinutes?: number,
  ): Promise<AutomaticTimeReleaseResult>;
  reopenDay(date: string): Promise<{
    status: 'reopened';
    reopenedDraftCount: number;
  }>;
  getPairingRequest(userCode: string): Promise<AutomaticTimePairingRequest>;
  approvePairingRequest(userCode: string): Promise<{ status: string }>;
  listDevices(): Promise<AutomaticTimeDevice[]>;
  revokeDevice(deviceId: string): Promise<{ status: string }>;
  listCorrectionMemories(): Promise<AutomaticTimeCorrectionMemory[]>;
  updateCorrectionMemory(
    memoryId: string,
    enabled: boolean,
  ): Promise<AutomaticTimeCorrectionMemoryMutation>;
  recomputeCorrectionMemory(memoryId: string): Promise<AutomaticTimeCorrectionMemoryMutation>;
  deleteCorrectionMemory(memoryId: string): Promise<void>;
  getLocalAlphaMetrics(): Promise<AutomaticTimeLocalAlphaMetrics>;
}

export interface PluginApi {
  get<T = unknown>(path: string, params?: Record<string, string>): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown): Promise<T>;
  delete<T = unknown>(path: string): Promise<T>;
}

export function createAutomaticTimeApi(api: PluginApi): AutomaticTimeApi {
  return {
    listDrafts: (date) => api.get('/drafts', { date }),
    getTimelineStatus: () => api.get('/timeline-status'),
    listIssueCandidates: () => api.get('/issue-candidates'),
    editDraft: (draftId, changes) => api.patch(`/drafts/${draftId}`, changes),
    assignDraft: (draftId, issueKey) => api.post(`/drafts/${draftId}/assign`, { issueKey }),
    hideDraft: (draftId) => api.post(`/drafts/${draftId}/hide`),
    deleteDraft: (draftId) => api.delete(`/drafts/${draftId}`).then(() => undefined),
    splitDraft: (draftId, splitAt) => api.post(`/drafts/${draftId}/split`, { splitAt }),
    mergeDrafts: (draftIds) => api.post('/drafts/merge', { draftIds }),
    addOfflineDraft: (input) => api.post('/drafts/offline', input),
    getDailyReview: (date) => api.get(`/review/${date}`),
    previewRelease: (date, reportedTotalMinutes) =>
      api.post(`/review/${date}/preview`, { reportedTotalMinutes }),
    releaseDay: (date, idempotencyKey, reportedTotalMinutes) =>
      api.post(`/review/${date}/release`, {
        idempotencyKey,
        ...(reportedTotalMinutes === undefined ? {} : { reportedTotalMinutes }),
      }),
    reopenDay: (date) => api.post(`/review/${date}/reopen`),
    getPairingRequest: (userCode) => api.get(`/pairing/requests/${encodeURIComponent(userCode)}`),
    approvePairingRequest: (userCode) =>
      api.post(`/pairing/requests/${encodeURIComponent(userCode)}/approve`),
    listDevices: () => api.get('/devices'),
    revokeDevice: (deviceId) => api.post(`/devices/${encodeURIComponent(deviceId)}/revoke`),
    listCorrectionMemories: () => api.get('/correction-memories'),
    updateCorrectionMemory: (memoryId, enabled) =>
      api.patch(`/correction-memories/${encodeURIComponent(memoryId)}`, { enabled }),
    recomputeCorrectionMemory: (memoryId) =>
      api.post(`/correction-memories/${encodeURIComponent(memoryId)}/recompute`),
    deleteCorrectionMemory: (memoryId) =>
      api.delete(`/correction-memories/${encodeURIComponent(memoryId)}`).then(() => undefined),
    getLocalAlphaMetrics: () => api.get('/local-alpha/metrics'),
  };
}
