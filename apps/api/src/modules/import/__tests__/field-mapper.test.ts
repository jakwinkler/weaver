import { FieldMapperService } from '../field-mapper.service';

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
      'jira.customer-impact': 'Customer-facing value',
    });
  });
});
