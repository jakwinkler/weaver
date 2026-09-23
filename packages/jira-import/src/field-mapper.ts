import type { JiraComment, JiraIssue, JiraStatus, MappedJiraIssue } from './types';

const SYSTEM_FIELDS = new Set([
  'summary',
  'description',
  'priority',
  'status',
  'issuetype',
  'assignee',
  'reporter',
  'labels',
  'attachment',
  'comment',
  'project',
  'parent',
  'created',
  'updated',
  'duedate',
]);

export class FieldMapper {
  mapPriority(name?: string): 'lowest' | 'low' | 'medium' | 'high' | 'highest' {
    switch ((name ?? '').trim().toLowerCase()) {
      case 'blocker':
      case 'critical':
      case 'highest':
        return 'highest';
      case 'major':
      case 'high':
        return 'high';
      case 'minor':
      case 'low':
        return 'low';
      case 'trivial':
      case 'lowest':
        return 'lowest';
      default:
        return 'medium';
    }
  }

  mapDescription(value: unknown): Record<string, unknown> | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'string') {
      return {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
      };
    }
    if (typeof value !== 'object') return this.mapDescription(String(value));

    const mapped = this.mapAdfNode(value as Record<string, any>);
    if (!mapped) return null;
    if (mapped.type === 'doc') return mapped;
    return { type: 'doc', content: [mapped] };
  }

  mapIssue(issue: JiraIssue, fieldNames: Record<string, string> = {}): MappedJiraIssue {
    const fields = issue.fields ?? {};
    const customFields: Record<string, unknown> = {};
    const customFieldNames: Record<string, string> = {};
    let storyPoints: number | null = null;
    let sprintExternalId: string | null = null;

    for (const [fieldId, value] of Object.entries(fields)) {
      if (SYSTEM_FIELDS.has(fieldId) || value === null || value === undefined) continue;
      if (!fieldId.startsWith('customfield_')) continue;

      const fieldName = fieldNames[fieldId] ?? fieldId;
      const normalizedName = fieldName.trim().toLowerCase();
      if (normalizedName === 'story points' || normalizedName === 'story point estimate') {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) storyPoints = numeric;
        continue;
      }
      if (normalizedName === 'sprint') {
        const sprint = Array.isArray(value) ? value[value.length - 1] : value;
        if (sprint && typeof sprint === 'object' && 'id' in sprint) {
          sprintExternalId = String((sprint as { id: unknown }).id);
        }
        continue;
      }

      const slug = `jira.${this.slugify(fieldName || fieldId)}`;
      customFields[slug] = this.normalizeCustomValue(value);
      customFieldNames[slug] = fieldName;
    }

    return {
      summary: String(fields.summary ?? issue.key).slice(0, 500),
      description: this.mapDescription(fields.description),
      priority: this.mapPriority(fields.priority?.name),
      status: fields.status ?? null,
      issueType: fields.issuetype ?? null,
      assigneeEmail: fields.assignee?.emailAddress ?? null,
      reporterEmail: fields.reporter?.emailAddress ?? null,
      labels: Array.isArray(fields.labels) ? fields.labels.map(String) : [],
      dueDate: this.dateOnly(fields.duedate),
      createdAt: this.dateTime(fields.created),
      updatedAt: this.dateTime(fields.updated),
      storyPoints,
      customFields,
      customFieldNames,
      sprintExternalId,
      parentExternalId: fields.parent?.id ? String(fields.parent.id) : null,
    };
  }

  mapComment(comment: JiraComment): Record<string, unknown> {
    return (
      this.mapDescription(comment.body) ?? {
        type: 'doc',
        content: [{ type: 'paragraph' }],
      }
    );
  }

  mapStatusCategory(status: JiraStatus): 'todo' | 'in_progress' | 'done' {
    const key =
      `${status.statusCategory?.key ?? ''} ${status.statusCategory?.name ?? ''} ${status.name}`.toLowerCase();
    if (/done|complete|closed|resolved/.test(key)) return 'done';
    if (/progress|doing|review|active/.test(key)) return 'in_progress';
    return 'todo';
  }

  slugify(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return (slug || 'field').slice(0, 90);
  }

  inferCustomFieldType(value: unknown): 'text' | 'number' | 'checkbox' | 'date' | 'multi_select' {
    if (Array.isArray(value)) return 'multi_select';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'checkbox';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
    return 'text';
  }

  private mapAdfNode(node: Record<string, any>): Record<string, any> | null {
    const typeMap: Record<string, string> = {
      doc: 'doc',
      paragraph: 'paragraph',
      text: 'text',
      heading: 'heading',
      bulletList: 'bulletList',
      orderedList: 'orderedList',
      listItem: 'listItem',
      blockquote: 'blockquote',
      codeBlock: 'codeBlock',
      hardBreak: 'hardBreak',
      rule: 'horizontalRule',
    };

    if (node.type === 'mention') {
      return { type: 'text', text: `@${node.attrs?.text ?? node.attrs?.id ?? 'user'}` };
    }
    if (node.type === 'emoji') {
      return { type: 'text', text: node.attrs?.text ?? node.attrs?.shortName ?? '' };
    }
    if (node.type === 'inlineCard') {
      const url = String(node.attrs?.url ?? '');
      return url
        ? { type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }
        : null;
    }

    const mappedType = typeMap[node.type];
    if (!mappedType) {
      const text = this.flattenText(node);
      return text ? { type: 'paragraph', content: [{ type: 'text', text }] } : null;
    }

    const mapped: Record<string, any> = { type: mappedType };
    if (node.text !== undefined) mapped.text = String(node.text);
    if (node.attrs && ['heading', 'orderedList', 'codeBlock'].includes(mappedType)) {
      mapped.attrs = node.attrs;
    }
    if (Array.isArray(node.marks)) {
      mapped.marks = node.marks
        .map((mark: Record<string, any>) => this.mapMark(mark))
        .filter(Boolean);
    }
    if (Array.isArray(node.content)) {
      const content = node.content
        .map((child: Record<string, any>) => this.mapAdfNode(child))
        .filter(Boolean);
      if (content.length > 0) mapped.content = content;
    }
    return mapped;
  }

  private mapMark(mark: Record<string, any>): Record<string, any> | null {
    const typeMap: Record<string, string> = {
      strong: 'bold',
      em: 'italic',
      strike: 'strike',
      code: 'code',
      underline: 'underline',
      link: 'link',
    };
    const type = typeMap[mark.type];
    if (!type) return null;
    return mark.attrs ? { type, attrs: mark.attrs } : { type };
  }

  private flattenText(node: Record<string, any>): string {
    if (typeof node.text === 'string') return node.text;
    if (!Array.isArray(node.content)) return '';
    return node.content.map((child: Record<string, any>) => this.flattenText(child)).join('');
  }

  private normalizeCustomValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((entry) => String(this.normalizeCustomValue(entry)));
    }
    if (value && typeof value === 'object') {
      const object = value as Record<string, unknown>;
      if ('value' in object) return object.value;
      if ('name' in object) return object.name;
      if ('displayName' in object) return object.displayName;
      return JSON.stringify(object);
    }
    return value;
  }

  private dateOnly(value: unknown): string | null {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
    return value.slice(0, 10);
  }

  private dateTime(value: unknown): Date | null {
    if (typeof value !== 'string') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}
