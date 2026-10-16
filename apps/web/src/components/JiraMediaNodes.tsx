import { Node, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useAttachments, getAttachmentUrl } from '@/api';

function ImportedMedia({
  node,
  issueKey,
  inline,
}: NodeViewProps & { issueKey: string; inline: boolean }) {
  const { data: files } = useAttachments(issueKey);
  const file = files?.find((value) => value.sourceMediaId === node.attrs.mediaId);
  const url = file ? getAttachmentUrl(file.id) : null;
  const image = file && /^image\/(png|jpeg|gif|webp|avif)$/i.test(file.mimeType);
  let externalUrl: string | null = null;
  try {
    const value = new URL(node.attrs.externalUrl);
    if (['https:', 'http:'].includes(value.protocol) && !value.username && !value.password)
      externalUrl = value.href;
  } catch {
    /* No usable external reference. */
  }
  return (
    <NodeViewWrapper
      as={inline ? 'span' : 'div'}
      contentEditable={false}
      className={inline ? 'inline-block align-middle' : 'my-3 min-w-0 max-w-full'}
    >
      {externalUrl ? (
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-border px-2 py-1 text-sm underline"
        >
          Open external image
        </a>
      ) : file && url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block max-w-full"
          aria-label={`Open ${file.filename}`}
        >
          {image ? (
            <img
              src={url}
              alt={file.filename}
              loading="lazy"
              className="h-auto max-w-full rounded border border-border"
              style={
                node.attrs.width
                  ? { width: Math.min(node.attrs.width, inline ? 240 : 1800) }
                  : undefined
              }
            />
          ) : (
            <span className="rounded border border-border px-2 py-1 text-sm underline">
              {file.filename}
            </span>
          )}
        </a>
      ) : (
        <span className="rounded border border-border bg-muted px-2 py-1 text-sm text-muted-foreground">
          {node.attrs.sourceUnavailable
            ? 'Image unavailable in Jira source'
            : 'Attachment unavailable'}
        </span>
      )}
    </NodeViewWrapper>
  );
}

function mediaNode(name: 'jiraMedia' | 'jiraMediaInline', inline: boolean) {
  return Node.create<{ issueKey: string }>({
    name,
    group: inline ? 'inline' : 'block',
    inline,
    atom: true,
    addOptions: () => ({ issueKey: '' }),
    addAttributes: () => ({
      mediaId: { default: '' },
      externalUrl: { default: null },
      sourceUnavailable: { default: false },
      width: { default: null },
      height: { default: null },
    }),
    parseHTML: () => [{ tag: `${inline ? 'span' : 'div'}[data-jira-media]` }],
    renderHTML: ({ node }) => [
      inline ? 'span' : 'div',
      { 'data-jira-media': node.attrs.mediaId },
      'Imported attachment',
    ],
    addNodeView() {
      const issueKey = this.options.issueKey;
      return ReactNodeViewRenderer((props: NodeViewProps) => (
        <ImportedMedia {...props} issueKey={issueKey} inline={inline} />
      ));
    },
  });
}

export const JiraMedia = mediaNode('jiraMedia', false);
export const JiraMediaInline = mediaNode('jiraMediaInline', true);
export const JiraMediaGroup = Node.create({
  name: 'jiraMediaGroup',
  group: 'block',
  content: 'jiraMedia+',
  addAttributes: () => ({ layout: { default: 'center' } }),
  parseHTML: () => [{ tag: 'div[data-jira-media-group]' }],
  renderHTML: ({ node }) => [
    'div',
    {
      'data-jira-media-group': '',
      class: `flex max-w-full flex-wrap gap-3 ${node.attrs.layout === 'align-start' ? 'justify-start' : node.attrs.layout === 'align-end' ? 'justify-end' : 'justify-center'}`,
    },
    0,
  ],
});
