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
  receivedAt: string;
}

export interface LinkedJam extends JamView {
  link: { source: string; backlinkState: string; linkedAt: string };
}

export interface ConnectionStatus {
  webhookUrl: string;
  webhookUrlIsLocal: boolean;
  workspaceId: string | null;
  tokenConfigured: boolean;
  webhookSecretConfigured: boolean;
  accessExpiresOn: string | null;
  daysUntilExpiry: number | null;
  postBacklinkComments: boolean;
  lastWebhookAt: string | null;
  lastVerifiedAt: string | null;
  connectionError: { message: string; at: string } | null;
  backlinks: { pending: number; failed: number };
}
