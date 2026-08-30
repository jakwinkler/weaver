import { useCallback, useEffect, useRef, useState } from 'react';
import type { Page } from '@weaver/shared';
import { Check, Cloud, LoaderCircle, Save, X } from 'lucide-react';
import { RichTextEditor } from '@/components/RichTextEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const EMPTY_DOCUMENT = { type: 'doc', content: [] };

interface PageEditorProps {
  page?: Page;
  parentTitle?: string;
  initialDraft?: PageDraft;
  onSave: (draft: {
    title: string;
    body: Record<string, unknown>;
  }) => Promise<Page>;
  onSaved: (page: Page, pendingDraft?: PageDraft) => void;
  onCancel: () => void;
}

export interface PageDraft {
  title: string;
  body: Record<string, unknown>;
}

export function PageEditor({
  page,
  parentTitle,
  initialDraft,
  onSave,
  onSaved,
  onCancel,
}: PageEditorProps) {
  const [title, setTitle] = useState(initialDraft?.title ?? page?.title ?? '');
  const [body, setBody] = useState<Record<string, unknown>>(
    initialDraft?.body ?? page?.body ?? EMPTY_DOCUMENT,
  );
  const [dirty, setDirty] = useState(Boolean(initialDraft));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const [saveCycle, setSaveCycle] = useState(0);
  const savingRef = useRef(false);
  const revisionRef = useRef(initialDraft ? 1 : 0);
  const latestDraftRef = useRef<PageDraft>({
    title: initialDraft?.title ?? page?.title ?? '',
    body: initialDraft?.body ?? page?.body ?? EMPTY_DOCUMENT,
  });

  const save = useCallback(async () => {
    const draft = latestDraftRef.current;
    if (!draft.title.trim() || savingRef.current || (!dirty && page)) return;
    const savingRevision = revisionRef.current;
    const savedDraft = { ...draft, title: draft.title.trim() };
    savingRef.current = true;
    setStatus('saving');
    setError('');
    try {
      const saved = await onSave(savedDraft);
      const hasNewerChanges = revisionRef.current !== savingRevision;

      if (!page) {
        onSaved(saved, hasNewerChanges ? latestDraftRef.current : undefined);
      } else {
        onSaved(saved);
        if (hasNewerChanges) {
          setDirty(true);
          setStatus('idle');
          setSaveCycle((cycle) => cycle + 1);
        } else {
          setDirty(false);
          setStatus('saved');
        }
      }
    } catch {
      setStatus('error');
      setError('We could not save this page. Your draft is still here.');
    } finally {
      savingRef.current = false;
    }
  }, [dirty, onSave, onSaved, page]);

  useEffect(() => {
    if (!dirty || !title.trim()) return;
    const timer = window.setTimeout(() => void save(), 2000);
    return () => window.clearTimeout(timer);
  }, [body, dirty, save, saveCycle, title]);

  const markTitle = (value: string) => {
    latestDraftRef.current = { ...latestDraftRef.current, title: value };
    revisionRef.current += 1;
    setTitle(value);
    setDirty(true);
    setStatus('idle');
  };

  const markBody = (value: Record<string, unknown>) => {
    latestDraftRef.current = { ...latestDraftRef.current, body: value };
    revisionRef.current += 1;
    setBody(value);
    setDirty(true);
    setStatus('idle');
  };

  return (
    <section className="mx-auto flex min-h-[65vh] w-full max-w-5xl flex-col px-5 py-6 sm:px-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0 flex-1">
          {parentTitle && (
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              New page under {parentTitle}
            </p>
          )}
          <Input
            value={title}
            onChange={(event) => markTitle(event.target.value)}
            placeholder="Page title"
            aria-label="Page title"
            className="h-auto border-0 px-0 py-1 text-3xl font-bold tracking-[-0.02em] shadow-none focus-visible:ring-0"
            autoFocus
          />
        </div>
        <div className="flex items-center gap-2">
          <span
            className="flex min-w-24 items-center justify-end gap-1.5 text-xs text-muted-foreground"
            aria-live="polite"
          >
            {status === 'saving' && <><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Saving</>}
            {status === 'saved' && <><Check className="h-3.5 w-3.5" /> Saved</>}
            {status === 'idle' && dirty && <><Cloud className="h-3.5 w-3.5" /> Autosaves</>}
          </span>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X />
            Cancel
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={!title.trim() || status === 'saving'}>
            <Save />
            Save now
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-3 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <RichTextEditor
        content={body}
        onChange={markBody}
        placeholder="Start writing. Use the toolbar for headings, lists, links, code, and images."
        editorClassName="min-h-[48vh] px-5 py-4 text-base leading-7"
      />
    </section>
  );
}
