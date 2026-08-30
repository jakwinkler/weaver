export interface AutomaticTimeDraft {
  id: string;
  sourceReference: string;
  localDate: string;
  startedAt: string;
  endedAt: string;
  proposedMinutes: number;
  description: string;
  issueKey: string | null;
  confidence: number;
  assignmentMethod: string;
  assignmentReasons: string[];
  status: 'draft' | 'hidden' | 'released' | 'superseded';
  releasedAt: string | null;
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
  releaseStatus: 'pending' | 'released' | 'reopened' | 'partially_locked' | null;
  reportedTotalMinutes: number;
  drafts: AutomaticTimeDraft[];
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

export interface AutomaticTimeApi {
  listDrafts(date: string): Promise<AutomaticTimeDraft[]>;
  listIssueCandidates(): Promise<IssueCandidate[]>;
  editDraft(
    draftId: string,
    changes: { proposedMinutes?: number; description?: string },
  ): Promise<AutomaticTimeDraft>;
  assignDraft(draftId: string, issueKey: string): Promise<AutomaticTimeDraft>;
  hideDraft(draftId: string): Promise<AutomaticTimeDraft>;
  deleteDraft(draftId: string): Promise<void>;
  getDailyReview(date: string): Promise<AutomaticTimeReview>;
  releaseDay(date: string, idempotencyKey: string): Promise<AutomaticTimeReleaseResult>;
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
    listIssueCandidates: () => api.get('/issue-candidates'),
    editDraft: (draftId, changes) => api.patch(`/drafts/${draftId}`, changes),
    assignDraft: (draftId, issueKey) => api.post(`/drafts/${draftId}/assign`, { issueKey }),
    hideDraft: (draftId) => api.post(`/drafts/${draftId}/hide`),
    deleteDraft: (draftId) => api.delete(`/drafts/${draftId}`).then(() => undefined),
    getDailyReview: (date) => api.get(`/review/${date}`),
    releaseDay: (date, idempotencyKey) => api.post(`/review/${date}/release`, { idempotencyKey }),
  };
}
