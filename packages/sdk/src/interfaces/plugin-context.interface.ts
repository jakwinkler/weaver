export interface PluginContext {
  /** Call only after provider authentication and payload validation. Deduplicates for seven days. */
  webhooks: { processOnce(digest: string, process: () => Promise<void>): Promise<boolean> };
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
  /**
   * `json` (the default) parses the body and returns `data: null` when it is not JSON.
   * `text` returns the raw body as a string, for example a `text/event-stream` reply.
   */
  responseType?: 'json' | 'text';
}

export interface HttpResponse {
  status: number;
  /** Parsed JSON, or the body string when the request used `responseType: 'text'`. */
  data: unknown;
  headers: Record<string, string>;
}

export interface PluginEventEmitter {
  emit(event: string, data: unknown): Promise<void>;
}

export interface PluginCoreApi {
  issues: {
    assertAccess(key: string, mode: 'read' | 'write'): Promise<void>;
    get(key: string): Promise<unknown>;
    findCandidates(filters?: PluginIssueCandidateFilters): Promise<PluginIssueCandidate[]>;
    /** Requires the `issue-create` core capability. */
    create(
      projectKey: string,
      input: PluginIssueCreateInput,
      options?: PluginIssueCreateOptions,
    ): Promise<PluginCreatedIssue>;
    update(key: string, data: Record<string, unknown>): Promise<unknown>;
    /**
     * A string becomes one paragraph. Pass a rich-text document to include mention nodes.
     * Resolves to null when the issue does not exist.
     */
    addComment(
      key: string,
      body: string | PluginRichTextDocument,
      options?: PluginCommentOptions,
    ): Promise<PluginComment | null>;
  };
  projects: {
    /** null means a tenant administrator; [] means no visible projects. */
    accessibleIds(): Promise<string[] | null>;
    /** Throws unless the request user can read (or write) the project. */
    assertAccess(key: string, mode: 'read' | 'write'): Promise<void>;
    get(key: string): Promise<unknown>;
    list(): Promise<unknown[]>;
  };
  users: {
    get(id: string): Promise<unknown>;
    list(): Promise<unknown[]>;
    /**
     * The tenant member with this email, matched case-insensitively, or null. Use it to map an
     * external identity to a Weaver user; it confers no access by itself.
     */
    findMemberByEmail(email: string): Promise<PluginTenantMember | null>;
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
    deleteBatch(ids: string[]): Promise<{ deleted: number }>;
    list(filters?: PluginTimeEntryFilters): Promise<PluginTimeEntry[]>;
    countOwnBySource(filters?: PluginTimeEntryDateFilters): Promise<PluginTimeEntrySourceCounts>;
    getLockState(ids: string[]): Promise<PluginTimeEntryLockState[]>;
  };
}

export type PluginCoreCapability = 'issue-candidates' | 'issue-create' | 'time-entries';

/** A TipTap/ProseMirror JSON document: `{ type: 'doc', content: [...] }`. */
export type PluginRichTextDocument = Record<string, unknown>;

export interface PluginIssueCreateInput {
  summary: string;
  description?: PluginRichTextDocument;
  priority?: 'lowest' | 'low' | 'medium' | 'high' | 'highest';
  issueTypeId?: string;
  assigneeId?: string;
  labels?: string[];
  parentId?: string;
  epicId?: string;
  customFields?: Record<string, unknown>;
  /** YYYY-MM-DD */
  startDate?: string;
  /** YYYY-MM-DD */
  dueDate?: string;
  percentDone?: number;
  storyPoints?: number | null;
}

export interface PluginIssueCreateOptions {
  /**
   * The issue's reporter. Defaults to the request user. Required when there is no request user,
   * such as on a public webhook route. Must be a tenant member with write access to the project.
   */
  reporterId?: string;
}

export interface PluginCreatedIssue {
  id: string;
  key: string;
  projectKey: string;
  summary: string;
  statusId: string;
  reporterId: string;
  assigneeId: string | null;
  createdAt: string;
}

export interface PluginCommentOptions {
  /**
   * The comment's author. Defaults to the request user. Required when there is no request user,
   * such as on a public webhook route. Must be a tenant member with write access to the project.
   */
  authorId?: string;
}

export interface PluginTenantMember {
  id: string;
  email: string;
  displayName: string;
}

export interface PluginComment {
  id: string;
  issueId: string;
  authorId: string;
  body: PluginRichTextDocument;
  createdAt: string;
}

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

export interface PluginTimeEntryDateFilters {
  loggedFrom?: string;
  loggedTo?: string;
}

export interface PluginTimeEntrySourceCounts {
  manual: number;
  timer: number;
  plugin: number;
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
