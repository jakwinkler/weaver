import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export type SortDirection = 'asc' | 'desc' | null;

interface SortableHeaderProps {
  label: string;
  field: string;
  currentSort: string | null;
  currentDirection: SortDirection;
  onSort: (field: string, direction: SortDirection) => void;
  className?: string;
}

export function SortableHeader({
  label,
  field,
  currentSort,
  currentDirection,
  onSort,
  className,
}: SortableHeaderProps) {
  const isActive = currentSort === field;

  const handleClick = () => {
    if (!isActive) {
      onSort(field, 'asc');
    } else if (currentDirection === 'asc') {
      onSort(field, 'desc');
    } else {
      onSort(field, null);
    }
  };

  return (
    <TableHead
      className={cn(
        'cursor-pointer select-none text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground',
        className,
      )}
      onClick={handleClick}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && currentDirection === 'asc' && (
          <ArrowUp className="h-3.5 w-3.5" />
        )}
        {isActive && currentDirection === 'desc' && (
          <ArrowDown className="h-3.5 w-3.5" />
        )}
        {!isActive && (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />
        )}
      </span>
    </TableHead>
  );
}
