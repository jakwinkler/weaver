import { createHash } from 'crypto';
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

  mapDescription(
    value: unknown,
    mentions: ReadonlyMap<string, string> = new Map(),
  ): Record<string, unknown> | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'string') {
      return {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
      };
    }
    if (typeof value !== 'object') return this.mapDescription(String(value));

    const mapped = this.mapAdfNode(value as Record<string, any>, mentions);
    if (!mapped) return null;
    if (mapped.type === 'doc') return mapped;
    return { type: 'doc', content: [mapped] };
  }

  mapIssue(
    issue: JiraIssue,
    fieldNames: Record<string, string> = {},
    source?: string,
  ): MappedJiraIssue {
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

      const namespace = source
        ? `${createHash('sha256').update(source).digest('hex').slice(0, 12)}.`
        : '';
      const slug = `jira.${namespace}${fieldId}`;
      customFields[slug] = this.normalizeCustomValue(value);
      customFieldNames[slug] = fieldName;
    }

    return {
      summary: String(fields.summary ?? issue.key).slice(0, 500),
      description: this.mapDescription(fields.description),
      priority: this.mapPriority(fields.priority?.name),
      status: fields.status ?? null,
      issueType: fields.issuetype ?? null,
      assignee: fields.assignee ?? null,
      reporter: fields.reporter ?? null,
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

  mapComment(
    comment: JiraComment,
    mentions: ReadonlyMap<string, string> = new Map(),
  ): Record<string, unknown> {
    return (
      this.mapDescription(comment.body, mentions) ?? {
        type: 'doc',
        content: [{ type: 'paragraph' }],
      }
    );
  }

  mapStatusCategory(status: JiraStatus): 'todo' | 'in_progress' | 'done' {
    const category = status.statusCategory?.key;
    if (category === 'indeterminate') return 'in_progress';
    if (category === 'new') return 'todo';
    if (category === 'done') return 'done';
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

  unsupportedNodes(body: unknown): string[] {
    const supported = new Set([
      'doc',
      'paragraph',
      'text',
      'heading',
      'bulletList',
      'orderedList',
      'listItem',
      'blockquote',
      'codeBlock',
      'hardBreak',
      'rule',
      'mention',
      'emoji',
      'inlineCard',
      'date',
      'table',
      'tableRow',
      'tableCell',
      'tableHeader',
      'media',
      'mediaInline',
      'mediaSingle',
      'mediaGroup',
    ]);
    const types = new Set<string>();
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (node.type && !supported.has(node.type)) types.add(node.type);
      if (Array.isArray(node.content)) node.content.forEach(walk);
    };
    walk(body);
    return [...types].sort();
  }

  sourceMediaWarnings(body: unknown): string[] {
    let temporary = false;
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (
        ['media', 'mediaInline'].includes(node.type) &&
        node.attrs?.type === 'external' &&
        String(node.attrs?.url ?? '').startsWith('blob:')
      )
        temporary = true;
      if (Array.isArray(node.content)) node.content.forEach(walk);
    };
    walk(body);
    return temporary
      ? [
          'Jira contains temporary browser image references. Their positions are preserved as unavailable images; recovering the original files requires source recovery. Original ADF remains in administrator source records.',
        ]
      : [];
  }

  private mapAdfNode(
    node: Record<string, any>,
    mentions: ReadonlyMap<string, string>,
  ): Record<string, any> | null {
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
      table: 'table',
      tableRow: 'tableRow',
      tableCell: 'tableCell',
      tableHeader: 'tableHeader',
    };

    if (node.type === 'date') {
      const date = new Date(Number(node.attrs?.timestamp));
      return {
        type: 'text',
        text: Number.isFinite(date.getTime())
          ? date.toISOString().slice(0, 10)
          : '[Invalid Jira date]',
      };
    }
    if (node.type === 'media' || node.type === 'mediaInline') {
      let externalUrl: string | undefined;
      let sourceUnavailable = false;
      if (node.attrs?.type === 'external' && typeof node.attrs.url === 'string') {
        try {
          const url = new URL(node.attrs.url);
          sourceUnavailable = url.protocol === 'blob:';
          if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) {
            externalUrl = url.href;
          }
        } catch {
          /* Malformed external references remain unavailable. */
        }
      }
      const attrs = {
        mediaId: String(node.attrs?.id ?? ''),
        ...(externalUrl ? { externalUrl } : {}),
        ...(sourceUnavailable ? { sourceUnavailable: true } : {}),
        ...Object.fromEntries(
          ['width', 'height']
            .filter((key) => Number.isFinite(node.attrs?.[key]) && node.attrs[key] > 0)
            .map((key) => [key, Math.min(node.attrs[key], 10000)]),
        ),
      };
      return { type: node.type === 'mediaInline' ? 'jiraMediaInline' : 'jiraMedia', attrs };
    }
    if (node.type === 'mediaSingle' || node.type === 'mediaGroup') {
      const content = (node.content ?? [])
        .map((child: Record<string, any>) => this.mapAdfNode(child, mentions))
        .filter((child: Record<string, any> | null) => child?.type === 'jiraMedia');
      return content.length
        ? {
            type: 'jiraMediaGroup',
            attrs: {
              layout: ['align-start', 'align-end', 'center'].includes(node.attrs?.layout)
                ? node.attrs.layout
                : 'center',
            },
            content,
          }
        : { type: 'paragraph', content: [{ type: 'text', text: '[Jira attachment unavailable]' }] };
    }

    if (node.type === 'mention') {
      const id = mentions.get(String(node.attrs?.id));
      const label = String(node.attrs?.text ?? 'Imported user').replace(/^@/, '');
      return id ? { type: 'mention', attrs: { id, label } } : { type: 'text', text: `@${label}` };
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
      const content = this.fallbackInlineContent(node, mentions);
      return content.length ? { type: 'paragraph', content } : null;
    }

    const mapped: Record<string, any> = { type: mappedType };
    if (node.text !== undefined) mapped.text = String(node.text);
    if (node.attrs && ['heading', 'orderedList', 'codeBlock'].includes(mappedType)) {
      mapped.attrs = node.attrs;
    }
    if (['tableCell', 'tableHeader'].includes(mappedType)) {
      const positive = (value: unknown) =>
        Number.isInteger(value) && Number(value) > 0 && Number(value) <= 100;
      mapped.attrs = {
        colspan: positive(node.attrs?.colspan) ? node.attrs.colspan : 1,
        rowspan: positive(node.attrs?.rowspan) ? node.attrs.rowspan : 1,
        colwidth:
          Array.isArray(node.attrs?.colwidth) &&
          node.attrs.colwidth.every(
            (width: unknown) =>
              Number.isInteger(width) && Number(width) > 0 && Number(width) <= 1800,
          )
            ? node.attrs.colwidth
            : null,
      };
    }
    if (Array.isArray(node.marks)) {
      mapped.marks = node.marks
        .map((mark: Record<string, any>) => this.mapMark(mark))
        .filter(Boolean);
    }
    if (Array.isArray(node.content)) {
      const content = node.content
        .map((child: Record<string, any>) => this.mapAdfNode(child, mentions))
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

  private fallbackInlineContent(
    node: Record<string, any>,
    mentions: ReadonlyMap<string, string>,
  ): Record<string, any>[] {
    if (['text', 'mention', 'emoji', 'inlineCard', 'hardBreak', 'date'].includes(node.type)) {
      const mapped = this.mapAdfNode(node, mentions);
      return mapped ? [mapped] : [];
    }
    const content: Record<string, any>[] = [];
    for (const child of node.content ?? []) {
      const next = this.fallbackInlineContent(child, mentions);
      if (!next.length) continue;
      if (
        content.length &&
        ['table', 'tableRow', 'tableCell', 'tableHeader', 'panel', 'expand'].includes(node.type)
      )
        content.push({ type: 'hardBreak' });
      content.push(...next);
    }
    if (content.length) return content;
    const text =
      node.attrs?.text ||
      (node.type?.startsWith('media') ? '[Jira attachment: see attached files]' : '');
    return text ? [{ type: 'text', text: String(text) }] : [];
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
