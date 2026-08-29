import { useEffect, useState, type KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const STORY_POINT_VALUES = [1, 2, 3, 5, 8, 13, 21] as const;

interface StoryPointsFieldProps {
  value: number | null | undefined;
  onChange: (value: number | null) => void | Promise<void>;
  disabled?: boolean;
  id?: string;
  showChips?: boolean;
  values?: readonly number[];
  compact?: boolean;
}

export function StoryPointsField({
  value,
  onChange,
  disabled = false,
  id,
  showChips = true,
  values = STORY_POINT_VALUES,
  compact = false,
}: StoryPointsFieldProps) {
  const [draft, setDraft] = useState(value === null || value === undefined ? '' : String(value));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(value === null || value === undefined ? '' : String(value));
  }, [value]);

  const save = async (nextValue: number | null) => {
    if (nextValue === (value ?? null)) {
      setDraft(nextValue === null ? '' : String(nextValue));
      return;
    }

    setSaving(true);
    try {
      await onChange(nextValue);
      setDraft(nextValue === null ? '' : String(nextValue));
    } catch {
      setDraft(value === null || value === undefined ? '' : String(value));
    } finally {
      setSaving(false);
    }
  };

  const commitDraft = () => {
    const normalized = draft.trim();
    if (normalized === '') {
      void save(null);
      return;
    }

    const nextValue = Number(normalized);
    if (!Number.isInteger(nextValue) || nextValue < 0) {
      setDraft(value === null || value === undefined ? '' : String(value));
      return;
    }
    void save(nextValue);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  if (disabled && compact) {
    return <span className="text-sm text-foreground">{value ?? '—'}</span>;
  }

  return (
    <div className={cn('space-y-2', compact && 'space-y-0')}>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={handleKeyDown}
          disabled={disabled || saving}
          placeholder="—"
          aria-label={id ? undefined : 'Story points'}
          className={cn('w-24', compact && 'h-7 w-16 px-2 text-sm')}
        />
        {!compact && value !== null && value !== undefined && !disabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void save(null)}
            disabled={saving}
          >
            Clear
          </Button>
        )}
      </div>
      {showChips && !disabled && (
        <div className="flex flex-wrap gap-1" aria-label="Common story point values">
          {values.map((points) => (
            <Button
              key={points}
              type="button"
              variant={value === points ? 'default' : 'outline'}
              size="sm"
              className="h-7 min-w-8 px-2 text-xs"
              onClick={() => void save(points)}
              disabled={saving}
            >
              {points}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
