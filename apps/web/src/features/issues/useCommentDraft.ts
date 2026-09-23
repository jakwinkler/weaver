import { useAuthStore } from '@/stores';

const DRAFT_PREFIX = 'weaver:comment-draft:';

function draftKey(issueKey: string): string | null {
  const { tenantId, user } = useAuthStore.getState();
  if (!tenantId || !user?.id) return null;
  return `${DRAFT_PREFIX}${tenantId}:${user.id}:${issueKey}`;
}

export function loadDraft(issueKey: string): Record<string, unknown> | null {
  try {
    const key = draftKey(issueKey);
    if (!key) return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveDraft(issueKey: string, content: Record<string, unknown>): void {
  const key = draftKey(issueKey);
  if (!key) return;
  // Skip empty docs (single empty paragraph)
  const doc = content as { type?: string; content?: Array<{ type?: string; content?: unknown[] }> };
  if (
    doc.type === 'doc' &&
    doc.content?.length === 1 &&
    doc.content[0].type === 'paragraph' &&
    (!doc.content[0].content || doc.content[0].content.length === 0)
  ) {
    return;
  }
  localStorage.setItem(key, JSON.stringify(content));
}

export function clearDraft(issueKey: string): void {
  const key = draftKey(issueKey);
  if (key) localStorage.removeItem(key);
}

export function clearAllCommentDrafts(): void {
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(DRAFT_PREFIX)) {
      localStorage.removeItem(key);
    }
  }
}
