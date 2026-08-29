import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface EditableCellProps {
  value: string;
  onSave: (value: string) => Promise<void>;
  editable?: boolean;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
}

export function EditableCell({
  value,
  onSave,
  editable = true,
  className,
  inputClassName,
  placeholder,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = useCallback(async () => {
    if (savingRef.current) return;

    const trimmed = draft.trim();
    if (trimmed === value || trimmed === '') {
      setDraft(value);
      setEditing(false);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch {
      setDraft(value);
      setEditing(false);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [draft, value, onSave]);

  const getAdjacentEditable = (
    current: HTMLInputElement,
    reverse: boolean,
  ): HTMLElement | undefined => {
    const scope = current.closest('tr, [role="row"]') || current.parentElement?.parentElement;
    if (!scope) return undefined;

    const editableElements = Array.from(
      scope.querySelectorAll<HTMLElement>('[data-inline-editable-focus]'),
    ).filter((element) => !element.hasAttribute('disabled'));
    const currentIndex = editableElements.indexOf(current);
    return editableElements[currentIndex + (reverse ? -1 : 1)];
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commit();
    } else if (e.key === 'Escape') {
      setDraft(value);
      setEditing(false);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const nextEditable = getAdjacentEditable(e.currentTarget, e.shiftKey);
      void commit().then(() => nextEditable?.focus());
    }
  };

  if (!editable) {
    return (
      <span className={cn('text-sm text-foreground', className)}>
        {value || placeholder || '-'}
      </span>
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          data-inline-editable-focus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={handleKeyDown}
          disabled={saving}
          className={cn('h-7 text-sm', inputClassName)}
        />
        {saving && (
          <Loader2 aria-label="Saving" className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-inline-editable-focus
      className={cn(
        'block w-full cursor-pointer rounded border-0 bg-transparent px-1 py-0.5 text-left text-sm text-foreground hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      onClick={() => setEditing(true)}
      title="Click to edit"
    >
      {value || <span className="text-muted-foreground">{placeholder || '-'}</span>}
    </button>
  );
}
