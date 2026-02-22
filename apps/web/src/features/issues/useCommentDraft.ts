const DRAFT_PREFIX = 'weaver:comment-draft:';

export function loadDraft(issueKey: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_PREFIX}${issueKey}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveDraft(issueKey: string, content: Record<string, unknown>): void {
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
  localStorage.setItem(`${DRAFT_PREFIX}${issueKey}`, JSON.stringify(content));
}

export function clearDraft(issueKey: string): void {
  localStorage.removeItem(`${DRAFT_PREFIX}${issueKey}`);
}
