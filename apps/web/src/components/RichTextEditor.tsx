import { useEditor, EditorContent, ReactRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useUploadAttachment, useGenericUploadAttachment, getAttachmentUrl } from '@/api';
import {
  extractPlainText,
  normalizeCommentBody,
  normalizeRichTextContent,
  serializeDoc,
} from '@/lib/richText';
import { MentionList } from './MentionSuggestion';
import { MentionWithAvatar } from './MentionNode';
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Link as LinkIcon,
  ImageIcon,
} from 'lucide-react';

const lowlight = createLowlight(common);

interface RichTextEditorProps {
  issueKey?: string;
  content: Record<string, unknown> | null;
  onChange?: (json: Record<string, unknown>) => void;
  placeholder?: string;
  editable?: boolean;
  editorClassName?: string;
}

export function RichTextEditor({
  issueKey,
  content,
  onChange,
  placeholder = 'Write something...',
  editable = true,
  editorClassName,
}: RichTextEditorProps) {
  const [uploadError, setUploadError] = useState(false);
  const issueUpload = useUploadAttachment(issueKey || '__noop__');
  const genericUpload = useGenericUploadAttachment();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handleImageUpload = useCallback(
    async (file: File) => {
      setUploadError(false);
      const result = issueKey
        ? await issueUpload.mutateAsync(file)
        : await genericUpload.mutateAsync(file);
      return getAttachmentUrl(result.id);
    },
    [issueKey, issueUpload, genericUpload],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: false,
      }),
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder }),
      Link.configure({ openOnClick: !editable, protocols: ['http', 'https', 'mailto', 'tel'] }),
      CodeBlockLowlight.configure({ lowlight }),
      MentionWithAvatar.configure({
        HTMLAttributes: {
          class: 'mention',
        },
        suggestion: {
          items: () => [],
          render: () => {
            let component: ReactRenderer<any> | null = null;
            let popup: TippyInstance[] | null = null;

            return {
              onStart: (props: any) => {
                component = new ReactRenderer(MentionList, {
                  props,
                  editor: props.editor,
                });

                if (!props.clientRect) return;

                popup = tippy('body', {
                  getReferenceClientRect: props.clientRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start',
                });
              },
              onUpdate: (props: any) => {
                component?.updateProps(props);
                if (popup?.[0] && props.clientRect) {
                  popup[0].setProps({
                    getReferenceClientRect: props.clientRect,
                  });
                }
              },
              onKeyDown: (props: any) => {
                if (props.event.key === 'Escape') {
                  popup?.[0]?.hide();
                  return true;
                }
                return (component?.ref as any)?.onKeyDown?.(props) ?? false;
              },
              onExit: () => {
                popup?.[0]?.destroy();
                component?.destroy();
              },
            };
          },
        },
      }),
    ],
    content: normalizeRichTextContent(content),
    editable,
    onUpdate: ({ editor: e }) => {
      onChangeRef.current?.(e.getJSON() as Record<string, unknown>);
    },
    editorProps: {
      attributes: {
        class: `${editable
          ? 'prose prose-sm max-w-none focus:outline-none min-h-[80px] px-3 py-2'
          : 'prose prose-sm max-w-none'} ${editorClassName ?? ''}`,
        'aria-label': placeholder,
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;

        for (const item of items) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) {
              handleImageUpload(file).then((url) => {
                if (url) editor?.chain().focus().setImage({ src: url }).run();
              }).catch(() => setUploadError(true));
            }
            return true;
          }
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;

        event.preventDefault();
        for (const file of files) {
          if (file.type.startsWith('image/')) {
            handleImageUpload(file).then((url) => {
              if (url) editor?.chain().focus().setImage({ src: url }).run();
            }).catch(() => setUploadError(true));
          } else if (issueKey) {
            issueUpload.mutate(file);
          } else {
            genericUpload.mutate(file);
          }
        }
        return true;
      },
    },
  });

  // Sync content from outside, including query refreshes in read-only renderers.
  const contentKey = JSON.stringify(content);
  const initialContentRef = useRef(contentKey);
  useEffect(() => {
    if (!editor) return;
    if (initialContentRef.current !== contentKey) {
      initialContentRef.current = contentKey;
      const normalized = normalizeRichTextContent(content);
      editor.commands.setContent(normalized ?? { type: 'doc', content: [{ type: 'paragraph' }] }, {
        emitUpdate: false,
      });
    }
  }, [contentKey, editor, content]);

  if (!editor) return null;

  if (!editable) {
    return <EditorContent editor={editor} />;
  }

  return (
    <div className="rounded-md border border-border focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
      {(uploadError || issueUpload.isError || genericUpload.isError) && <p role="alert" className="px-3 py-2 text-sm text-destructive">Upload failed. Check the file size and try again.</p>}
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

export function RichTextRenderer({ content }: Pick<RichTextEditorProps, 'content'>) {
  return <RichTextEditor content={content} editable={false} />;
}

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  const btn = (active: boolean) =>
    `rounded p-1.5 ${active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`;

  const handleLink = () => {
    const url = window.prompt('URL:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const handleImage = () => {
    const url = window.prompt('Image URL:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={btn(editor.isActive('bold'))}
        title="Bold"
      >
        <Bold className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={btn(editor.isActive('italic'))}
        title="Italic"
      >
        <Italic className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={btn(editor.isActive('strike'))}
        title="Strikethrough"
      >
        <Strikethrough className="h-4 w-4" />
      </button>

      <div className="mx-1 h-5 w-px bg-border" />

      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={btn(editor.isActive('heading', { level: 1 }))}
        title="Heading 1"
      >
        <Heading1 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={btn(editor.isActive('heading', { level: 2 }))}
        title="Heading 2"
      >
        <Heading2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={btn(editor.isActive('heading', { level: 3 }))}
        title="Heading 3"
      >
        <Heading3 className="h-4 w-4" />
      </button>

      <div className="mx-1 h-5 w-px bg-border" />

      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={btn(editor.isActive('bulletList'))}
        title="Bullet List"
      >
        <List className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={btn(editor.isActive('orderedList'))}
        title="Ordered List"
      >
        <ListOrdered className="h-4 w-4" />
      </button>

      <div className="mx-1 h-5 w-px bg-border" />

      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={btn(editor.isActive('blockquote'))}
        title="Blockquote"
      >
        <Quote className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className={btn(editor.isActive('codeBlock'))}
        title="Code Block"
      >
        <Code className="h-4 w-4" />
      </button>

      <div className="mx-1 h-5 w-px bg-border" />

      <button
        type="button"
        onClick={handleLink}
        className={btn(editor.isActive('link'))}
        title="Link"
      >
        <LinkIcon className="h-4 w-4" />
      </button>
      <button type="button" onClick={handleImage} className={btn(false)} title="Image">
        <ImageIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

export { extractPlainText, normalizeCommentBody, normalizeRichTextContent, serializeDoc };
