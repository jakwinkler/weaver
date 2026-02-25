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
    const trimmed = draft.trim();
    if (trimmed === value || trimmed === '') {
      setDraft(value);
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch {
      setDraft(value);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [draft, value, onSave]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      setDraft(value);
      setEditing(false);
    } else if (e.key === 'Tab') {
      commit();
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
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          disabled={saving}
          className={cn('h-7 text-sm', inputClassName)}
        />
        {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>
    );
  }

  return (
    <span
      className={cn(
        'cursor-pointer rounded px-1 py-0.5 text-sm text-foreground hover:bg-muted/80',
        className,
      )}
      onClick={() => setEditing(true)}
      title="Click to edit"
    >
      {value || <span className="text-muted-foreground">{placeholder || '-'}</span>}
    </span>
  );
}
