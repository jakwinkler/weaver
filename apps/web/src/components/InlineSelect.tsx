import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface InlineSelectOption {
  value: string;
  label: string;
  color?: string;
}

interface InlineSelectProps {
  value: string;
  options: InlineSelectOption[];
  onSave: (value: string) => Promise<void>;
  editable?: boolean;
  renderValue?: (value: string, option?: InlineSelectOption) => React.ReactNode;
  className?: string;
  ariaLabel?: string;
}

export function InlineSelect({
  value,
  options,
  onSave,
  editable = true,
  renderValue,
  className,
  ariaLabel,
}: InlineSelectProps) {
  const [saving, setSaving] = useState(false);

  const currentOption = options.find((o) => o.value === value);

  const handleChange = async (newValue: string) => {
    if (newValue === value) return;
    setSaving(true);
    try {
      await onSave(newValue);
    } catch {
      // error handled by caller
    } finally {
      setSaving(false);
    }
  };

  const displayNode = renderValue
    ? renderValue(value, currentOption)
    : currentOption?.label || value;

  if (!editable) {
    return <span className={cn('text-sm', className)}>{displayNode}</span>;
  }

  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      <Select value={value} onValueChange={handleChange} disabled={saving}>
        <SelectTrigger
          aria-label={ariaLabel}
          data-inline-editable-focus
          className={cn(
            'h-7 min-w-[6rem] border-transparent bg-transparent px-1 text-sm shadow-none hover:border-input hover:bg-muted/50 focus:ring-1',
            saving && 'opacity-60',
          )}
        >
          <SelectValue>{displayNode}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.color ? (
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: opt.color }}
                  />
                  {opt.label}
                </span>
              ) : (
                opt.label
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {saving && (
        <Loader2 aria-label="Saving" className="h-3 w-3 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
