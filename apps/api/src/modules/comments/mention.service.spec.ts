import { MentionService } from './mention.service';

describe('MentionService', () => {
  const service = new MentionService();

  it('extracts unique mentions from nested TipTap content', () => {
    expect(
      service.extractMentions({
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      { type: 'mention', attrs: { id: 'user-1' } },
                      { type: 'mention', attrs: { id: 'user-1' } },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'paragraph',
            content: [{ type: 'mention', attrs: { id: 'user-2' } }],
          },
        ],
      }),
    ).toEqual(['user-1', 'user-2']);
  });

  it('ignores malformed mention nodes', () => {
    expect(
      service.extractMentions({
        type: 'doc',
        content: [
          { type: 'mention', attrs: { id: 42 } },
          { type: 'mention', attrs: { id: '' } },
          { type: 'mention' },
        ],
      }),
    ).toEqual([]);
  });
});
