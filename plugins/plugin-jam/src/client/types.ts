import type { PluginComponentContext } from '@weaver/sdk';

export type { PluginComponentContext };

export interface JamSystemInfo {
  browser?: { name: string | null; version: string | null };
  os?: { name: string | null; version: string | null };
  screen?: { width: number; height: number };
  connection?: { effectiveType: string };
}

export interface JamView {
  jamId: string;
  jamUrl: string;
  type: string;
  title: string | null;
  description: string | null;
  originalUrl: string | null;
  origin: string | null;
  authorName: string | null;
  authorEmail: string | null;
  thumbnailUrl: string | null;
  systemInfo: JamSystemInfo;
  recordingLinkName: string | null;
  submitterComment: string | null;
  createdAt: string;
  receivedVia: string;
  state: string;
  flag: string | null;
  suggestedProjectKey: string | null;
  receivedAt: string;
}

export interface LinkedJam extends JamView {
  link: { source: string; backlinkState: string; linkedAt: string };
}

export interface IssueJamsResponse {
  items: LinkedJam[];
  display: { showDebugSummary: boolean; embedPlayer: boolean; recordingRequests: boolean };
}

export interface JamSummary {
  fetchedAt: string;
  console: {
    total: number;
    levels: Record<string, number>;
    errors: Array<{ level: string; message: string; at: string | null }>;
  };
  network: {
    total: number;
    failed: number;
    failures: Array<{
      method: string;
      host: string;
      path: string;
      status: number | null;
      durationMs: number | null;
    }>;
  };
}

export interface RecordingRequest {
  id: string;
  title: string | null;
  url: string | null;
  requestedBy: string;
  expiresAt: string;
  revokedAt: string | null;
  status: 'active' | 'expired' | 'revoked';
  jamsReceived: number;
  createdAt: string;
}

export interface RuleMatch {
  urlHosts?: string[];
  urlHost?: string;
  pathPrefix?: string;
  authorEmailDomain?: string;
  recordingLinkPublicId?: string;
  origin?: string;
  titlePrefix?: string;
  folder?: string;
}

export interface RoutingRule {
  id: string;
  position: number;
  name: string;
  enabled: boolean;
  match: RuleMatch;
  action: 'create' | 'inbox';
  projectKey: string;
  projectName: string;
  issueTypeId: string | null;
  priority: string | null;
  labels: string[];
  assigneeId: string | null;
  hourlyLimit: number | null;
  createdBy: string;
  createdAt: string;
}

export interface ConnectionStatus {
  webhookUrl: string;
  webhookUrlIsLocal: boolean;
  workspaceId: string | null;
  tokenConfigured: boolean;
  webhookSecretConfigured: boolean;
  recordingLinkConfigured: boolean;
  /** The connected domain request links start recording from, or null for Jam's generic recorder. */
  recordingUrlId: string | null;
  /** Active requests made before 0.3.0, which use the reusable recording link. */
  olderRecordingRequests: { active: number; lastExpiresAt: string | null };
  accessExpiresOn: string | null;
  daysUntilExpiry: number | null;
  postBacklinkComments: boolean;
  lastWebhookAt: string | null;
  lastVerifiedAt: string | null;
  connectionError: { message: string; at: string } | null;
  backlinks: { pending: number; failed: number };
}

/** The Jam workspace's connected domains, from Jam's listRecordingUrls. */
export interface RecordingDomains {
  configuredId: string | null;
  domains: Array<{ id: string; url: string | null; verified: boolean; configured: boolean }>;
}
