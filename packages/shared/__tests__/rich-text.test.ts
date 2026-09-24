import { createCommentSchema, createIssueSchema, createPageSchema } from '../src/schemas';

const doc = (content: unknown[]) => ({ type: 'doc', content });
const text = (value: string) => ({ type: 'text', text: value });

describe('rich-text input boundaries', () => {
  it('accepts editor formatting, mentions, and uploaded images', () => {
    const body = doc([
      { type: 'heading', attrs: { level: 2 }, content: [text('Title')] },
      {
        type: 'paragraph',
        content: [
          {
            ...text('link'),
            marks: [
              {
                type: 'link',
                attrs: {
                  href: 'https://example.com',
                  target: '_blank',
                  rel: 'noopener noreferrer nofollow',
                  class: null,
                },
              },
            ],
          },
          {
            type: 'mention',
            attrs: {
              id: '0a1c9c34-a96c-4363-a962-77eb53ea1d72',
              label: 'Matt',
              email: null,
              avatarUrl: null,
              mentionSuggestionChar: '@',
            },
          },
        ],
      },
      {
        type: 'image',
        attrs: {
          src: '/api/v1/attachments/0a1c9c34-a96c-4363-a962-77eb53ea1d72',
          alt: null,
          title: null,
          width: null,
          height: null,
        },
      },
    ]);
    expect(createCommentSchema.safeParse({ body }).success).toBe(true);
  });

  it.each([
    {},
    { type: 'script' },
    doc([{ type: 'paragraph', content: [{ type: 'unknown' }] }]),
    doc([{ type: 'image', attrs: { src: 'data:image/svg+xml,<svg/>' } }]),
    doc([{ type: 'image', attrs: { src: '//tracker.example/a' } }]),
    doc([{ type: 'paragraph', attrs: { onclick: 'alert(1)' } }]),
    doc([
      {
        type: 'paragraph',
        content: [
          { ...text('bad'), marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
        ],
      },
    ]),
    doc([{ type: 'paragraph', content: [text('x'.repeat(100_001))] }]),
  ])('rejects malformed or unsafe documents across entry points: %p', (body) => {
    expect(createCommentSchema.safeParse({ body }).success).toBe(false);
    expect(createIssueSchema.safeParse({ summary: 'test', description: body }).success).toBe(false);
    expect(createPageSchema.safeParse({ title: 'test', body }).success).toBe(false);
  });

  it('rejects deep input without overflowing validation itself', () => {
    const body = JSON.parse('{"content":['.repeat(5000) + '{}' + ']}'.repeat(5000));
    expect(createCommentSchema.safeParse({ body }).success).toBe(false);
  });

  it('bounds broad documents', () => {
    expect(
      createCommentSchema.safeParse({
        body: doc(Array.from({ length: 5001 }, () => ({ type: 'paragraph' }))),
      }).success,
    ).toBe(false);
  });
});
