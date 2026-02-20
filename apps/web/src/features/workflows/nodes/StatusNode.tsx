import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { StatusCategory } from '@weaver/shared';
import type { StatusNodeData } from '../hooks/useWorkflowNodes';

const CATEGORY_STYLES: Record<
  StatusCategory,
  { bg: string; border: string; label: string }
> = {
  todo: { bg: '#dbeafe', border: '#93c5fd', label: 'To Do' },
  in_progress: { bg: '#fef3c7', border: '#fcd34d', label: 'In Progress' },
  done: { bg: '#d1fae5', border: '#6ee7b7', label: 'Done' },
};

const handleStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  background: '#6366f1',
  border: '2px solid white',
};

export const StatusNode: React.NamedExoticComponent<
  NodeProps & { data: StatusNodeData }
> = memo(function StatusNode({
  data,
  selected,
}: NodeProps & { data: StatusNodeData }) {
  const { status } = data;
  const cat = CATEGORY_STYLES[status.category];

  return (
    <div
      style={{
        background: cat.bg,
        borderTopColor: selected ? '#6366f1' : cat.border,
        borderRightColor: selected ? '#6366f1' : cat.border,
        borderBottomColor: selected ? '#6366f1' : cat.border,
        borderLeftColor: status.color,
        borderLeftWidth: 4,
        boxShadow: selected ? '0 0 0 2px rgba(99,102,241,0.4)' : undefined,
      }}
      className="rounded-lg border-2 px-4 py-3"
    >
      {/* 4 handles — all type="source" for floating edges with ConnectionMode.Loose */}
      <Handle type="source" position={Position.Top} id="top" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="right" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={handleStyle} />
      <Handle type="source" position={Position.Left} id="left" style={handleStyle} />

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-gray-900">
            {status.name}
          </div>
          <div className="text-xs text-gray-500">{cat.label}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {status.isInitial && (
            <span
              style={{ background: '#3b82f6' }}
              className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
            >
              START
            </span>
          )}
          {status.isTerminal && (
            <span
              style={{ background: '#10b981' }}
              className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
            >
              END
            </span>
          )}
        </div>
      </div>

      <div
        className="mt-2 h-1.5 w-full rounded-full"
        style={{ backgroundColor: status.color }}
      />
    </div>
  );
});
