export type JiraSource = 'jira_cloud' | 'jira_server';

export type JiraAuth =
  | {
      type: 'api_token';
      token: string;
      email?: string;
    }
  | {
      type: 'oauth';
      accessToken: string;
    };

export interface JiraConnectionConfig {
  source: JiraSource;
  baseUrl: string;
  auth: JiraAuth;
}

export interface JiraProjectSummary {
  id: string;
  key: string;
  name: string;
  description?: string;
}

export interface JiraImportRequest {
  config: JiraConnectionConfig;
  /** Omit to import every accessible project. When present, this is an exact allowlist. */
  projectKeys?: string[];
  /** Select issues updated on or after this ISO date; retain their complete history. */
  updatedSince?: string;
}

export type ImportJobStatus =
  'queued' | 'running' | 'completed' | 'needs_review' | 'failed' | 'cancelled';

export interface ImportJobError {
  itemType: string;
  itemId?: string;
  message: string;
}

export interface ImportJob {
  id: string;
  source: JiraSource;
  sourceUrl: string;
  status: ImportJobStatus;
  progress: number;
  currentStep: string;
  totalItems: number;
  importedItems: number;
  skippedItems: number;
  errors: ImportJobError[];
  report?: {
    counts: Record<string, number>;
    conflicts: string[];
    warnings: string[];
    restrictedComments: number;
    restrictedWorklogs: number;
    scope?: { updatedSince: string | null };
  };
  selectedProjectKeys: string[] | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JiraImportJobData {
  importJobId: string;
  tenantId: string;
  schemaName: string;
  requestedByUserId: string;
  config: JiraConnectionConfig;
  projectKeys?: string[];
  updatedSince?: string;
}

/** Only ciphertext, IDs and format version are persisted to the queue. */
export interface SealedJiraImportJobData {
  version: 1;
  tenantId: string;
  importJobId: string;
  payload: string;
}
