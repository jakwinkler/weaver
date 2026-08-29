export type RichTextDocument = Record<string, unknown>;

const BLOCK_NODE_TYPES = new Set(['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRichTextDocument(value: unknown): value is RichTextDocument {
  if (!isRecord(value) || value.type !== 'doc') return false;
  return value.content === undefined || Array.isArray(value.content);
}

function plainTextDocument(text: string): RichTextDocument {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: text ? [{ type: 'text', text }] : undefined,
      },
    ],
  };
}

export function normalizeRichTextContent(content: unknown): RichTextDocument | null {
  if (content === null || content === undefined || content === '') return null;

  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('{')) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (isRichTextDocument(parsed)) return parsed;
        if (isRecord(parsed) && typeof parsed.text === 'string') {
          return plainTextDocument(parsed.text);
        }
        return null;
      } catch {
        // Preserve malformed legacy values as plain text.
      }
    }

    return plainTextDocument(content);
  }

  if (isRichTextDocument(content)) return content;

  if (isRecord(content) && typeof content.text === 'string') {
    return plainTextDocument(content.text);
  }

  return null;
}

export function isRichTextEmpty(content: unknown): boolean {
  const doc = normalizeRichTextContent(content);
  if (!doc) return true;

  function hasContent(node: unknown): boolean {
    if (!isRecord(node)) return false;

    if (node.type === 'text') {
      return typeof node.text === 'string' && node.text.trim().length > 0;
    }

    if (node.type === 'image' || node.type === 'mention') return true;

    return Array.isArray(node.content) && node.content.some(hasContent);
  }

  return !hasContent(doc);
}

export function extractPlainText(content: unknown): string {
  const doc = normalizeRichTextContent(content);
  if (!doc) return '';

  const output: string[] = [];
  const appendLineBreak = () => {
    if (output.length > 0 && output[output.length - 1] !== '\n') output.push('\n');
  };

  function walk(node: unknown) {
    if (!isRecord(node)) return;

    if (node.type === 'text' && typeof node.text === 'string') {
      output.push(node.text);
      return;
    }

    if (node.type === 'mention') {
      const attrs = isRecord(node.attrs) ? node.attrs : {};
      const label = attrs.label ?? attrs.id;
      if (typeof label === 'string' && label) output.push(`@${label}`);
      return;
    }

    if (node.type === 'hardBreak') {
      appendLineBreak();
      return;
    }

    if (node.type === 'image') {
      const attrs = isRecord(node.attrs) ? node.attrs : {};
      if (typeof attrs.alt === 'string' && attrs.alt) output.push(attrs.alt);
      return;
    }

    if (Array.isArray(node.content)) node.content.forEach(walk);
    if (typeof node.type === 'string' && BLOCK_NODE_TYPES.has(node.type)) appendLineBreak();
  }

  walk(doc);
  return output
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function serializeDoc(doc: RichTextDocument | null): string {
  if (isRichTextEmpty(doc)) return '';
  return JSON.stringify(doc);
}

// Kept for compatibility with the existing comment feature imports.
export const normalizeCommentBody = normalizeRichTextContent;
