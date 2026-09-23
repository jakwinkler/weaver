import Mention from '@tiptap/extension-mention';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { UserAvatar } from './UserAvatar';

interface MentionChipProps {
  id: string;
  label?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}

export function MentionChip({ id, label, email, avatarUrl }: MentionChipProps) {
  const displayName = label || email || id;

  return (
    <span className="mention" data-user-id={id}>
      <UserAvatar
        user={{
          displayName,
          email: email ?? undefined,
          avatarUrl: avatarUrl ?? undefined,
        }}
        size="sm"
        className="h-4 w-4 shrink-0 text-[8px]"
      />
      <span>@{displayName}</span>
    </span>
  );
}

function MentionNodeView({ node }: NodeViewProps) {
  return (
    <NodeViewWrapper as="span" className="inline">
      <MentionChip
        id={String(node.attrs.id ?? '')}
        label={node.attrs.label}
        email={node.attrs.email}
        avatarUrl={node.attrs.avatarUrl}
      />
    </NodeViewWrapper>
  );
}

export const MentionWithAvatar = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      email: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-email'),
        renderHTML: (attributes) => (attributes.email ? { 'data-email': attributes.email } : {}),
      },
      avatarUrl: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-avatar-url'),
        renderHTML: (attributes) =>
          attributes.avatarUrl ? { 'data-avatar-url': attributes.avatarUrl } : {},
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(MentionNodeView);
  },
});
