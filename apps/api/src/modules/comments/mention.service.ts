import { BadRequestException, Injectable } from '@nestjs/common';
import { RICH_TEXT_MAX_DEPTH, RICH_TEXT_MAX_NODES } from '@weaver/shared';

@Injectable()
export class MentionService {
  /**
   * Extract unique user IDs from mention nodes in TipTap JSON content.
   * Walks the document tree with bounded iteration looking for { type: 'mention', attrs: { id } }.
   */
  extractMentions(doc: Record<string, unknown> | null): string[] {
    if (!doc) return [];

    const ids = new Set<string>();

    const pending: Array<{ node: unknown; depth: number }> = [{ node: doc, depth: 0 }];
    let visited = 0;
    while (pending.length) {
      const { node, depth } = pending.pop()!;
      if (++visited > RICH_TEXT_MAX_NODES || depth > RICH_TEXT_MAX_DEPTH) {
        throw new BadRequestException('Rich-text nesting or node limit exceeded');
      }
      if (!node || typeof node !== 'object') continue;

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
        if (richTextNode.content.length + pending.length + visited > RICH_TEXT_MAX_NODES) {
          throw new BadRequestException('Rich-text node limit exceeded');
        }
        for (const child of [...richTextNode.content].reverse())
          pending.push({ node: child, depth: depth + 1 });
      }
    }

    return [...ids];
  }
}
