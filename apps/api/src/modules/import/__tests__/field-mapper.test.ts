import { FieldMapperService } from '../field-mapper.service';

describe('Jira structured formatting', () => {
  const mapper = new FieldMapperService();
  it('keeps dates visible using the UTC calendar day', () => {
    expect(
      mapper.mapDescription({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'date', attrs: { timestamp: String(Date.parse('2026-08-15T00:00:00Z')) } },
            ],
          },
        ],
      }),
    ).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '2026-08-15' }] }],
    });
  });
  it('preserves table rows, spanning cells, headings, formatting and source mentions', () => {
    const result = mapper.mapDescription(
      {
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableHeader',
                    attrs: { colspan: 2, rowspan: 1, colwidth: [120, 180] },
                    content: [
                      {
                        type: 'heading',
                        attrs: { level: 3 },
                        content: [
                          { type: 'text', text: 'Original heading', marks: [{ type: 'strong' }] },
                        ],
                      },
                    ],
                  },
                  {
                    type: 'tableCell',
                    content: [
                      {
                        type: 'paragraph',
                        content: [
                          { type: 'mention', attrs: { id: 'source-user', text: '@Original user' } },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      new Map([['source-user', 'staged-user']]),
    );
    expect(result).toMatchObject({
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  attrs: { colspan: 2, colwidth: [120, 180] },
                  content: [
                    {
                      type: 'heading',
                      content: [{ text: 'Original heading', marks: [{ type: 'bold' }] }],
                    },
                  ],
                },
                {
                  type: 'tableCell',
                  content: [{ content: [{ type: 'mention', attrs: { id: 'staged-user' } }] }],
                },
              ],
            },
          ],
        },
      ],
    });
  });
  it('preserves block and inline media identities without copying remote image URLs', () => {
    const mediaId = '1f0d2140-cc1c-41b4-8020-033f52106178';
    const result = mapper.mapDescription({
      type: 'doc',
      content: [
        {
          type: 'mediaSingle',
          attrs: { layout: 'align-start' },
          content: [
            {
              type: 'media',
              attrs: {
                id: mediaId,
                type: 'file',
                width: 400,
                height: 200,
                url: 'https://private.example/file?token=secret',
              },
            },
          ],
        },
        {
          type: 'paragraph',
          content: [{ type: 'mediaInline', attrs: { id: mediaId, type: 'file' } }],
        },
      ],
    });
    expect(result).toMatchObject({
      content: [
        {
          type: 'jiraMediaGroup',
          attrs: { layout: 'align-start' },
          content: [{ type: 'jiraMedia', attrs: { mediaId, width: 400, height: 200 } }],
        },
        { content: [{ type: 'jiraMediaInline', attrs: { mediaId } }] },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('private.example');
    expect(
      mapper.unsupportedNodes({
        type: 'doc',
        content: [
          { type: 'date', attrs: { timestamp: '0' } },
          { type: 'table' },
          { type: 'tableRow' },
          { type: 'tableCell' },
          { type: 'media', attrs: { type: 'file' } },
          { type: 'mediaSingle' },
          { type: 'mediaGroup' },
          { type: 'mediaInline', attrs: { type: 'file' } },
        ],
      }),
    ).toEqual([]);
  });
});

describe('FieldMapperService', () => {
  const mapper = new FieldMapperService();

  it.each([
    ['Highest', 'highest'],
    ['High', 'high'],
    ['Medium', 'medium'],
    ['Low', 'low'],
    ['Lowest', 'lowest'],
    ['Blocker', 'highest'],
    [undefined, 'medium'],
  ])('maps Jira priority %s to Weaver priority %s', (jiraPriority, expected) => {
    expect(mapper.mapPriority(jiraPriority)).toBe(expected);
  });

  it('converts Jira ADF descriptions to TipTap JSON', () => {
    const adf = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Important', marks: [{ type: 'strong' }] },
            { type: 'text', text: ' migration' },
          ],
        },
      ],
    };

    expect(mapper.mapDescription(adf)).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Important', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' migration' },
          ],
        },
      ],
    });
  });

  it('wraps Jira Server plain-text descriptions in a TipTap document', () => {
    expect(mapper.mapDescription('Line one\nLine two')).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Line one\nLine two' }],
        },
      ],
    });
  });

  it.each(['panel', 'expand'])('preserves structured mentions inside a Jira %s', (type) => {
    const result = mapper.mapDescription(
      {
        type: 'doc',
        content: [
          {
            type,
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'mention', attrs: { id: 'source-account', text: '@Original author' } },
                  { type: 'text', text: ' please review', marks: [{ type: 'strong' }] },
                ],
              },
              { type: 'paragraph', content: [{ type: 'text', text: 'Second line' }] },
            ],
          },
        ],
      },
      new Map([['source-account', 'staged-person-id']]),
    );

    expect(result).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'mention', attrs: { id: 'staged-person-id', label: 'Original author' } },
            { type: 'text', text: ' please review', marks: [{ type: 'bold' }] },
            { type: 'hardBreak' },
            { type: 'text', text: 'Second line' },
          ],
        },
      ],
    });
  });

  it('keeps mentions in nested table cells without nesting block nodes in a paragraph', () => {
    const result = mapper.mapDescription(
      {
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    content: [
                      {
                        type: 'paragraph',
                        content: [
                          {
                            type: 'mention',
                            attrs: { id: 'private-account', text: '@Private email user' },
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: 'tableCell',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Original note' }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      new Map([['private-account', 'private-staged-id']]),
    );
    expect(result).toMatchObject({ content: [{ type: 'table' }] });
    const cells = (result?.content as Array<{ content: Array<{ content: any[] }> }>)[0].content[0]
      .content;
    expect(cells).toHaveLength(2);
    expect(cells[0].type).toBe('tableCell');
    expect(cells[0].content[0]).toEqual({
      type: 'paragraph',
      content: [
        { type: 'mention', attrs: { id: 'private-staged-id', label: 'Private email user' } },
      ],
    });
    expect(cells[1].content[0].content[0].text).toBe('Original note');
  });

  it('keeps unmapped Jira custom fields for later custom-field creation', () => {
    const mapped = mapper.mapIssue(
      {
        id: '10042',
        key: 'PROJ-42',
        fields: {
          summary: 'Migrate me',
          priority: { name: 'Highest' },
          customfield_10016: 8,
          customfield_10100: 'Customer-facing value',
        },
      },
      {
        customfield_10016: 'Story points',
        customfield_10100: 'Customer impact',
      },
    );

    expect(mapped.storyPoints).toBe(8);
    expect(mapped.customFields).toEqual({
      'jira.customfield_10100': 'Customer-facing value',
    });
  });
});

describe('Jira attribution when email is private', () => {
  it('retains the stable source user identities with no email address', () => {
    const mapper = new FieldMapperService();
    const mapped = mapper.mapIssue({
      id: '1',
      key: 'GS-1',
      fields: {
        assignee: { accountId: 'account-one', displayName: 'Original assignee' },
        reporter: { accountId: 'account-two', displayName: 'Original reporter' },
      },
    });
    expect(mapped).toMatchObject({
      assignee: { accountId: 'account-one' },
      reporter: { accountId: 'account-two' },
    });
  });
});

describe('external Jira media', () => {
  const mapper = new FieldMapperService();
  it('preserves a safe external image URL as a reference without an attachment identity', () => {
    const doc = mapper.mapDescription({
      type: 'doc',
      content: [
        {
          type: 'mediaSingle',
          content: [
            {
              type: 'media',
              attrs: { type: 'external', url: 'https://images.example.test/source.png' },
            },
          ],
        },
      ],
    });
    expect(doc).toMatchObject({
      content: [
        {
          content: [
            {
              attrs: {
                mediaId: '',
                externalUrl: 'https://images.example.test/source.png',
              },
            },
          ],
        },
      ],
    });
  });
  it.each([
    'javascript:alert(1)',
    'data:image/svg+xml,unsafe',
    'https://user:secret@example.test/image',
    'not a URL',
  ])('does not retain unsafe external reference %s', (url) => {
    const doc = mapper.mapDescription({
      type: 'doc',
      content: [
        { type: 'mediaSingle', content: [{ type: 'media', attrs: { type: 'external', url } }] },
      ],
    });
    expect(JSON.stringify(doc)).not.toContain('externalUrl');
  });
});

it('records unrecoverable temporary Jira image references without keeping a usable URL', () => {
  const mapper = new FieldMapperService();
  const source = {
    type: 'doc',
    content: [
      {
        type: 'mediaSingle',
        content: [
          {
            type: 'media',
            attrs: { type: 'external', url: 'blob:https://jira.example.test/temporary-image' },
          },
        ],
      },
    ],
  };
  const doc = mapper.mapDescription(source);
  expect(doc).toMatchObject({
    content: [{ content: [{ attrs: { mediaId: '', sourceUnavailable: true } }] }],
  });
  expect(mapper.sourceMediaWarnings(source)).toHaveLength(1);
});
