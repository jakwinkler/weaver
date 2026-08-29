import { RichTextEditor } from './RichTextEditor';

interface RichTextRendererProps {
  content: Record<string, unknown> | null;
  issueKey?: string;
}

export function RichTextRenderer({ content, issueKey }: RichTextRendererProps) {
  return <RichTextEditor issueKey={issueKey} content={content} editable={false} />;
}
