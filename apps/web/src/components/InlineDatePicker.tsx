import { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface InlineDatePickerProps {
  value: string | null | undefined;
  onSave: (value: string | null) => Promise<void>;
  editable?: boolean;
  className?: string;
  placeholder?: string;
}

export function InlineDatePicker({
  value,
  onSave,
  editable = true,
  className,
  placeholder = '-',
}: InlineDatePickerProps) {
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayValue = value
    ? new Date(value + 'T00:00:00').toLocaleDateString()
    : placeholder;

  // Normalize value for input[type=date] (YYYY-MM-DD)
  const inputValue = value?.slice(0, 10) || '';

  const handleChange = async (newValue: string) => {
    const saveValue = newValue || null;
    if (saveValue === value) return;
    setSaving(true);
    try {
      await onSave(saveValue);
    } catch {
      // error handled by caller
    } finally {
      setSaving(false);
    }
  };

  if (!editable) {
    return (
      <span className={cn('text-sm text-muted-foreground', className)}>
        {displayValue}
      </span>
    );
  }

  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      <input
        ref={inputRef}
        type="date"
        value={inputValue}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        className={cn(
          'h-7 rounded-md border border-transparent bg-transparent px-1 text-sm text-foreground',
          'hover:border-input hover:bg-muted/50',
          'focus:border-input focus:outline-none focus:ring-1 focus:ring-ring',
          saving && 'opacity-60',
        )}
      />
      {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
    </div>
  );
}
