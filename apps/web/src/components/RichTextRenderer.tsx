import { RichTextEditor } from './RichTextEditor';

interface RichTextRendererProps {
  content: Record<string, unknown> | null;
  issueKey?: string;
  className?: string;
}

export function RichTextRenderer({ content, issueKey, className }: RichTextRendererProps) {
  return (
    <RichTextEditor
      issueKey={issueKey}
      content={content}
      editable={false}
      editorClassName={className}
    />
  );
}
