import { z } from 'zod';

export const RICH_TEXT_MAX_DEPTH = 32;
export const RICH_TEXT_MAX_NODES = 5000;
const MAX_DOCUMENT_LENGTH = 100_000;
const blocks = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'codeBlock',
  'horizontalRule',
  'image',
]);
const inline = new Set(['text', 'hardBreak', 'mention']);
const plainMarks = new Set(['bold', 'italic', 'strike', 'code', 'underline']);
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function safeUrl(value: unknown, link = false): boolean {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(value))
    return false;
  if (/^\/(?!\/)/.test(value) || (link && /^#[\w-]+$/.test(value))) return true;
  try {
    const url = new URL(value);
    return (link ? ['https:', 'http:', 'mailto:', 'tel:'] : ['https:', 'http:']).includes(
      url.protocol,
    );
  } catch {
    return false;
  }
}

function attributes(type: string, value: unknown): boolean {
  if (value === undefined) return !['image', 'mention', 'link'].includes(type);
  if (!object(value)) return false;
  const allowed: Record<string, string[]> = {
    heading: ['level'],
    orderedList: ['start', 'type'],
    codeBlock: ['language'],
    image: ['src', 'alt', 'title', 'width', 'height'],
    mention: ['id', 'label', 'email', 'avatarUrl', 'mentionSuggestionChar'],
    link: ['href', 'target', 'rel', 'class', 'title'],
  };
  for (const [key, attr] of Object.entries(value)) {
    if (!allowed[type]?.includes(key)) return false;
    if (attr !== null && typeof attr !== 'string' && typeof attr !== 'number') return false;
    if (typeof attr === 'string' && attr.length > 2048) return false;
    if (typeof attr === 'number' && !Number.isFinite(attr)) return false;
  }
  if (
    type === 'heading' &&
    value.level !== undefined &&
    (!Number.isInteger(value.level) || Number(value.level) < 1 || Number(value.level) > 6)
  )
    return false;
  if (
    type === 'orderedList' &&
    value.start !== undefined &&
    (!Number.isInteger(value.start) || Number(value.start) < 1)
  )
    return false;
  if (type === 'image' && !safeUrl(value.src)) return false;
  if (type === 'link' && !safeUrl(value.href, true)) return false;
  if (
    type === 'mention' &&
    (typeof value.id !== 'string' ||
      !value.id ||
      (value.avatarUrl != null && !safeUrl(value.avatarUrl)))
  )
    return false;
  return true;
}

/** Iterative validation runs before Zod can recursively clone attacker-supplied JSON. */
export function isRichTextDocument(value: unknown): value is Record<string, unknown> {
  if (!object(value) || value.type !== 'doc') return false;
  const pending = [{ node: value, depth: 0 }];
  const seen = new Set<object>();
  let count = 0;
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (++count > RICH_TEXT_MAX_NODES || depth > RICH_TEXT_MAX_DEPTH || seen.has(node))
      return false;
    seen.add(node);
    const type = node.type;
    if (
      typeof type !== 'string' ||
      (!blocks.has(type) && !inline.has(type) && !['doc', 'listItem'].includes(type))
    )
      return false;
    if (depth > 0 && type === 'doc') return false;
    if (
      Object.keys(node).some((key) => !['type', 'content', 'attrs', 'marks', 'text'].includes(key))
    )
      return false;
    if (!attributes(type, node.attrs)) return false;
    if (type === 'text') {
      if (typeof node.text !== 'string' || !node.text || node.text.length > MAX_DOCUMENT_LENGTH)
        return false;
    } else if (node.text !== undefined) return false;
    if (node.marks !== undefined) {
      if (!inline.has(type) || !Array.isArray(node.marks) || node.marks.length > 6) return false;
      for (const mark of node.marks) {
        if (
          !object(mark) ||
          typeof mark.type !== 'string' ||
          (!plainMarks.has(mark.type) && mark.type !== 'link')
        )
          return false;
        if (
          Object.keys(mark).some((key) => !['type', 'attrs'].includes(key)) ||
          !attributes(mark.type, mark.attrs)
        )
          return false;
      }
    }
    const children = node.content ?? [];
    if (!Array.isArray(children) || children.length + pending.length + count > RICH_TEXT_MAX_NODES)
      return false;
    if (
      ['text', 'mention', 'hardBreak', 'image', 'horizontalRule'].includes(type) &&
      children.length
    )
      return false;
    if (['bulletList', 'orderedList', 'listItem', 'blockquote'].includes(type) && !children.length)
      return false;
    for (const child of children) {
      if (!object(child) || typeof child.type !== 'string') return false;
      if (['doc', 'blockquote', 'listItem'].includes(type) && !blocks.has(child.type)) return false;
      if (['paragraph', 'heading'].includes(type) && !inline.has(child.type)) return false;
      if (['bulletList', 'orderedList'].includes(type) && child.type !== 'listItem') return false;
      if (type === 'codeBlock' && (child.type !== 'text' || child.marks !== undefined))
        return false;
      pending.push({ node: child, depth: depth + 1 });
    }
    if (type === 'listItem' && children[0]?.type !== 'paragraph') return false;
  }
  return JSON.stringify(value).length <= MAX_DOCUMENT_LENGTH;
}

export const richTextDocumentSchema = z.custom<Record<string, unknown>>(
  isRichTextDocument,
  'Invalid rich-text document: check structure, URLs, size, and nesting limits',
);
