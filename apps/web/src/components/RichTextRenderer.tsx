import { RichTextEditor } from './RichTextEditor';

export function RichTextRenderer({
  content,
  className,
}: {
  content: Record<string, unknown> | null;
  className?: string;
}) {
  return (
    <RichTextEditor
      content={content}
      editable={false}
      editorClassName={className}
    />
  );
}
