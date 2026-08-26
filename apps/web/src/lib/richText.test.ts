import { describe, expect, it } from 'vitest';
import {
  extractPlainText,
  isRichTextEmpty,
  normalizeRichTextContent,
  serializeDoc,
} from './richText';

const formattedDoc = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Release notes', marks: [{ type: 'bold' }] }],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First item' }] }],
        },
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second item' }] }],
        },
      ],
    },
  ],
};

describe('normalizeRichTextContent', () => {
  it('normalizes stored TipTap JSON strings without exposing the JSON source', () => {
    expect(normalizeRichTextContent(`  ${JSON.stringify(formattedDoc)}  `)).toEqual(formattedDoc);
  });

  it('preserves legacy plain text as a TipTap document', () => {
    expect(normalizeRichTextContent('Legacy project description')).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Legacy project description' }],
        },
      ],
    });
  });

  it('rejects malformed rich-text objects instead of handing them to TipTap', () => {
    expect(normalizeRichTextContent({ unexpected: 'shape' })).toBeNull();
  });
});

describe('rich-text content helpers', () => {
  it('extracts readable text from headings and list items', () => {
    expect(extractPlainText(formattedDoc)).toBe('Release notes\nFirst item\nSecond item');
  });

  it('recognizes empty documents while retaining non-text content', () => {
    expect(
      isRichTextEmpty({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }],
      }),
    ).toBe(true);
    expect(
      isRichTextEmpty({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'image', attrs: { src: '/image.png' } }] },
        ],
      }),
    ).toBe(false);
  });

  it('serializes only meaningful documents', () => {
    expect(serializeDoc({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe('');
    expect(serializeDoc(formattedDoc)).toBe(JSON.stringify(formattedDoc));
  });
});
