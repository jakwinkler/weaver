import type { JamSystemInfo, JamView } from './types';

export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  const response = (error as { response?: { status?: number; data?: { message?: unknown } } })
    .response;
  const message = response?.data?.message;
  if (typeof message === 'string' && message) return message;
  if (Array.isArray(message)) return message.join(', ');
  if (response?.status === 403) return 'You do not have permission to do that';
  return error instanceof Error && error.message ? error.message : fallback;
}

export function isForbidden(error: unknown): boolean {
  return (error as { response?: { status?: number } }).response?.status === 403;
}

export function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return new Date(iso).toLocaleDateString();
}

/** A position in a recording, such as 0:07 or 1:02:03. */
export function clockTime(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

export function environment(info: JamSystemInfo): string | null {
  const nameVersion = (value?: { name: string | null; version: string | null }) =>
    value?.name ? [value.name, value.version].filter(Boolean).join(' ') : null;
  const browser = nameVersion(info.browser);
  const os = nameVersion(info.os);
  const parts = [browser && os ? `${browser} on ${os}` : (browser ?? os)];
  if (info.screen) parts.push(`${info.screen.width}x${info.screen.height}`);
  if (info.connection) parts.push(info.connection.effectiveType);
  const present = parts.filter(Boolean);
  return present.length ? present.join(', ') : null;
}

const ORIGINS: Record<string, string> = {
  extension_chrome: 'Chrome extension',
  recording_link: 'Recording link',
  web_recorder: 'Web recorder',
  dashboard: 'Jam dashboard',
  native_macos: 'Mac app',
  native_cli: 'Jam CLI',
  mobile_ios: 'iOS',
  mobile_android: 'Android',
  csup_intercom: 'Intercom',
};

const TYPES: Record<string, string> = {
  video: 'Video',
  screenshot: 'Screenshot',
  sessionReplay: 'Replay',
  replay: 'Replay',
};

export function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export function jamMeta(jam: JamView): string {
  return [
    TYPES[jam.type] ?? jam.type,
    jam.origin ? (ORIGINS[jam.origin] ?? jam.origin) : null,
    hostOf(jam.originalUrl),
    jam.authorName ?? jam.authorEmail,
    relativeTime(jam.createdAt),
  ]
    .filter(Boolean)
    .join(' · ');
}

const FLAGS: Record<string, string> = {
  invalid_reference: 'Recording request link was not valid',
  request_revoked: 'Recorded through a revoked request',
  request_expired: 'Recorded through an expired request',
  recording_request_unmatched: 'From a recording link; Sync cannot tell which request',
  rate_limited: "Over a rule's hourly limit",
  rule_failed: 'A rule could not create the issue',
  routing_failed: 'Could not attach to the requesting issue',
  routing_lookup_failed: 'Could not check the Jam folder',
  possible_duplicate: 'May already have an issue',
};

export function flagLabel(flag: string | null): string | null {
  return flag ? (FLAGS[flag] ?? flag) : null;
}

export const buttonClass =
  'inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50';
export const primaryButtonClass =
  'inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50';
export const inputClass =
  'h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground';
