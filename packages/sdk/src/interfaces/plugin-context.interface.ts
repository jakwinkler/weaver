export interface PluginContext {
  /** Tenant-scoped database access */
  db: PluginDbAccess;
  /** HTTP client for external API calls */
  http: PluginHttpClient;
  /** Emit domain events */
  events: PluginEventEmitter;
  /** Plugin settings for current tenant */
  settings: Record<string, unknown>;
  /** Access to core Weaver APIs */
  api: PluginCoreApi;
  /** Scoped logger */
  logger: PluginLogger;
  /** Current tenant info */
  tenant: { id: string; slug: string; schemaName: string };
  /** Current user info (if request-scoped) */
  user?: { id: string; email: string; displayName: string };
}

export interface PluginDbAccess {
  query(sql: string, params?: unknown[]): Promise<unknown[]>;
  runMigration(sql: string): Promise<void>;
}

export interface PluginHttpClient {
  get(url: string, options?: RequestOptions): Promise<HttpResponse>;
  post(url: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse>;
  put(url: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse>;
  patch(url: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse>;
  delete(url: string, options?: RequestOptions): Promise<HttpResponse>;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
}

export interface HttpResponse {
  status: number;
  data: unknown;
  headers: Record<string, string>;
}

export interface PluginEventEmitter {
  emit(event: string, data: unknown): Promise<void>;
}

export interface PluginCoreApi {
  issues: {
    get(key: string): Promise<unknown>;
    findCandidates(filters?: PluginIssueCandidateFilters): Promise<PluginIssueCandidate[]>;
    update(key: string, data: Record<string, unknown>): Promise<unknown>;
    addComment(key: string, body: string): Promise<unknown>;
  };
  projects: {
    get(key: string): Promise<unknown>;
    list(): Promise<unknown[]>;
  };
  users: {
    get(id: string): Promise<unknown>;
    list(): Promise<unknown[]>;
  };
  customFields: {
    register(definition: {
      name: string;
      slug: string;
      fieldType: string;
      entityType: string;
      options?: Record<string, unknown>;
      required?: boolean;
    }): Promise<unknown>;
    unregisterAll(): Promise<void>;
  };
  activityLog: {
    create(
      issueKey: string,
      dto: {
        action: string;
        fieldName?: string | null;
        oldValue?: string | null;
        newValue?: string | null;
      },
    ): Promise<unknown>;
  };
  timeEntries: {
    createBatch(request: PluginTimeEntryBatchRequest): Promise<PluginTimeEntryBatchResult>;
    update(id: string, changes: PluginTimeEntryChanges): Promise<PluginTimeEntry>;
    delete(id: string): Promise<void>;
    list(filters?: PluginTimeEntryFilters): Promise<PluginTimeEntry[]>;
    getLockState(ids: string[]): Promise<PluginTimeEntryLockState[]>;
  };
}

export type PluginCoreCapability = 'issue-candidates' | 'time-entries';

export interface PluginIssueCandidateFilters {
  projectKeys?: string[];
  issueKeys?: string[];
  updatedSince?: string;
  includeUnassigned?: boolean;
  limit?: number;
}

export interface PluginIssueCandidate {
  id: string;
  key: string;
  summary: string;
  projectKey: string;
  statusCategory: string;
  assigneeId: string | null;
  updatedAt: string;
}

export interface PluginTimeEntryBatchItem {
  issueKey: string;
  sourceReference: string;
  minutes: number;
  description?: string;
  startedAt?: string;
  endedAt?: string;
  loggedAt?: string;
}

export interface PluginTimeEntryBatchRequest {
  entries: PluginTimeEntryBatchItem[];
}

export interface PluginTimeEntryBatchResult {
  entries: PluginTimeEntry[];
  created: number;
}

export interface PluginTimeEntryChanges {
  minutes?: number;
  description?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
}

export interface PluginTimeEntryFilters {
  issueKeys?: string[];
  sourceReferences?: string[];
  loggedFrom?: string;
  loggedTo?: string;
}

export interface PluginTimeEntry {
  id: string;
  issueId: string;
  userId: string;
  minutes: number;
  description: string | null;
  loggedAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  source: 'manual' | 'timer' | 'plugin';
  sourcePluginId: string | null;
  sourceReference: string | null;
  lockedAt: Date | null;
  lockReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PluginTimeEntryLockState {
  id: string;
  locked: boolean;
  lockedAt: Date | null;
  lockReason: string | null;
}

export interface PluginLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}
