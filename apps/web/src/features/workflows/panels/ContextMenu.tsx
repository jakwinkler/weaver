import { useEffect, useRef } from 'react';

interface ContextMenuProps {
  open: boolean;
  position: { x: number; y: number };
  isInitial: boolean;
  isTerminal: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleInitial: () => void;
  onToggleTerminal: () => void;
  onClose: () => void;
}

export function ContextMenu({
  open,
  position,
  isInitial,
  isTerminal,
  onEdit,
  onDelete,
  onToggleInitial,
  onToggleTerminal,
  onClose,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  if (!open) return null;

  const items = [
    { label: 'Edit', onClick: onEdit },
    { label: isInitial ? 'Unset Initial' : 'Set as Initial', onClick: onToggleInitial },
    { label: isTerminal ? 'Unset Terminal' : 'Set as Terminal', onClick: onToggleTerminal },
    { label: 'Delete', onClick: onDelete, danger: true },
  ];

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 200,
      }}
      className="min-w-[160px] rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className={`block w-full px-4 py-1.5 text-left text-sm ${
            item.danger
              ? 'text-red-600 hover:bg-red-50'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
