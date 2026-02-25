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

    function walk(node: any) {
      if (!node) return;
      if (node.type === 'mention' && node.attrs?.id) {
        ids.add(node.attrs.id);
      }
      if (Array.isArray(node.content)) {
        for (const child of node.content) {
          walk(child);
        }
      }
    }

    walk(doc);
    return [...ids];
  }
}
