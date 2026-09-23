import { Injectable } from '@nestjs/common';

@Injectable()
export class MentionService {
  /**
   * Extract unique user IDs from mention nodes in TipTap JSON content.
   * Walks the document tree recursively looking for { type: 'mention', attrs: { id } }.
   */
  extractMentions(doc: Record<string, unknown> | null): string[] {
    if (!doc) return [];

    const ids = new Set<string>();

    function walk(node: unknown) {
      if (!node || typeof node !== 'object') return;

      const richTextNode = node as {
        type?: unknown;
        attrs?: { id?: unknown };
        content?: unknown;
      };
      if (
        richTextNode.type === 'mention' &&
        typeof richTextNode.attrs?.id === 'string' &&
        richTextNode.attrs.id.length > 0
      ) {
        ids.add(richTextNode.attrs.id);
      }
      if (Array.isArray(richTextNode.content)) {
        for (const child of richTextNode.content) {
          walk(child);
        }
      }
    }

    walk(doc);
    return [...ids];
  }
}
