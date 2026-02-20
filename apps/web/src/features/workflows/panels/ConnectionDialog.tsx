import { useState, useRef, useEffect, type FormEvent } from 'react';

interface ConnectionDialogProps {
  open: boolean;
  position: { x: number; y: number };
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export function ConnectionDialog({
  open,
  position,
  onConfirm,
  onCancel,
}: ConnectionDialogProps) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onConfirm(name.trim());
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -50%)',
        zIndex: 100,
      }}
      className="nodrag nopan"
    >
      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-gray-200 bg-white p-3 shadow-xl"
      >
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Transition name
        </label>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onCancel();
            }}
            placeholder="e.g. Start Work"
            className="block w-40 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Add
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
