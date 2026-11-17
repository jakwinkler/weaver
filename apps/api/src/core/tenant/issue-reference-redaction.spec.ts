import { maskReferences } from './issue-reference-redaction';

describe('restricted issue references', () => {
  it('removes hidden relationship IDs, rich-link labels, and activity text without changing unrelated content', () => {
    const result = maskReferences(
      {
        key: 'EPD-10',
        parentId: 'hidden-id',
        summary: 'Visible issue',
        description: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Secret title',
                  marks: [{ type: 'link', attrs: { href: '/issues/EPD-31' } }],
                },
                { type: 'text', text: 'Public context EPD-310' },
              ],
            },
          ],
        },
        history: [{ from: 'blocks EPD-31: Secret title' }],
        related: [
          { id: 'hidden-id', summary: 'Secret' },
          { id: 'visible-id', summary: 'Visible' },
        ],
      },
      new Set(['hidden-id']),
      new Set(['EPD-31']),
    );
    expect(JSON.stringify(result)).not.toContain('Secret');
    expect(result).toMatchObject({
      parentId: null,
      summary: 'Visible issue',
      related: [{ id: 'visible-id' }],
    });
    expect(JSON.stringify(result)).toContain('Public context EPD-310');
  });
  it('removes remote-link titles with restricted URLs, including encoded keys', () => {
    const value = {
      links: [
        { id: 'link1', title: 'Secret plain title', url: 'https://jira.example/browse/EPD-31' },
        { id: 'link2', title: 'Secret encoded title', href: '/issues/EPD%2D31' },
        { id: 'link3', title: 'Safe title', url: '/issues/EPD-310' },
      ],
    };
    expect(maskReferences(value, new Set(), new Set(['EPD-31']))).toEqual({
      links: [value.links[2]],
    });
  });
});
