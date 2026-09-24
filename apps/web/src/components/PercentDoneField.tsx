import { useEffect, useRef, useState } from 'react';

export function PercentDoneField({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  onCommit: (value: number) => void | Promise<unknown>;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const committed = useRef(value);
  useEffect(() => {
    setDraft(value);
    committed.current = value;
  }, [value]);
  const commit = async () => {
    if (disabled || saving || draft === committed.current) return;
    committed.current = draft;
    setSaving(true);
    setError(false);
    try {
      await onCommit(draft);
    } catch {
      committed.current = value;
      setDraft(value);
      setError(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <input
        aria-label="Percent done"
        type="range"
        min="0"
        max="100"
        step="5"
        value={draft}
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={() => void commit()}
        onKeyUp={() => void commit()}
        onBlur={() => void commit()}
        disabled={disabled || saving}
        className="h-2 w-24 cursor-pointer accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <span className="text-sm text-foreground">{draft}%</span>
      {error && (
        <span role="alert" className="text-sm text-destructive">
          Could not save progress. Try again.
        </span>
      )}
    </>
  );
}
