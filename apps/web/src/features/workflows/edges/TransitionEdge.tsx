import { memo, useCallback, useRef } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useInternalNode,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react';
import type { TransitionEdgeData } from '../hooks/useWorkflowEdges';
import { getEdgeParams } from '../utils/floatingEdge';

/**
 * Build a smooth path through a waypoint using two cubic bezier segments.
 * The path passes exactly through the waypoint.
 */
function buildPathThroughWaypoint(
  sx: number, sy: number,
  tx: number, ty: number,
  wx: number, wy: number,
): string {
  return (
    `M ${sx} ${sy} ` +
    `C ${sx + (wx - sx) * 0.5} ${sy}, ${wx} ${sy + (wy - sy) * 0.5}, ${wx} ${wy} ` +
    `C ${wx} ${wy + (ty - wy) * 0.5}, ${tx + (wx - tx) * 0.5} ${ty}, ${tx} ${ty}`
  );
}

export const TransitionEdge: React.NamedExoticComponent<
  EdgeProps & { data: TransitionEdgeData }
> = memo(function TransitionEdge({
  id,
  source,
  target,
  data,
  selected,
}: EdgeProps & { data: TransitionEdgeData }) {
  const { screenToFlowPosition } = useReactFlow();
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!sourceNode || !targetNode) {
    return null;
  }

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode);
  const waypoint = data?.waypoint;

  let edgePath: string;
  let handleX: number;
  let handleY: number;

  if (waypoint) {
    edgePath = buildPathThroughWaypoint(sx, sy, tx, ty, waypoint.x, waypoint.y);
    handleX = waypoint.x;
    handleY = waypoint.y;
  } else {
    const [path, labelX, labelY] = getSmoothStepPath({
      sourceX: sx,
      sourceY: sy,
      targetX: tx,
      targetY: ty,
      sourcePosition: sourcePos,
      targetPosition: targetPos,
      borderRadius: 8,
      offset: 20,
    });
    edgePath = path;
    handleX = labelX;
    handleY = labelY;
  }

  // Label position: always at path midpoint for consistency
  const labelX = waypoint ? waypoint.x : handleX;
  const labelY = waypoint ? waypoint.y - 18 : handleY - 18;

  // Drag state refs
  const isDragging = useRef(false);

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!selected) return;
      e.stopPropagation();
      e.preventDefault();
      isDragging.current = false;

      const startX = e.clientX;
      const startY = e.clientY;

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!isDragging.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
          isDragging.current = true;
        }
        if (isDragging.current) {
          const pos = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
          data?.onWaypointChange?.(id, pos);
        }
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [id, data, selected, screenToFlowPosition],
  );

  const onHandleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // Double-click resets the waypoint
      data?.onWaypointChange?.(id, null);
    },
    [id, data],
  );

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? '#6366f1' : '#94a3b8',
          strokeWidth: selected ? 2.5 : 1.5,
        }}
        markerEnd="url(#arrow)"
      />
      <EdgeLabelRenderer>
        {/* Transition name label */}
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <div
            style={{
              background: selected ? '#6366f1' : '#f1f5f9',
              color: selected ? '#fff' : '#334155',
              borderColor: selected ? '#6366f1' : '#cbd5e1',
            }}
            className="flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium"
          >
            <span>{data?.transition?.name ?? ''}</span>
            {data?.onDelete && selected && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  data.onDelete(id);
                }}
                className="ml-0.5 rounded-full p-0.5 text-white/70 hover:text-red-200"
                title="Delete transition"
              >
                <svg
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Draggable waypoint handle — visible when selected */}
        {selected && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${handleX}px,${handleY}px)`,
              pointerEvents: 'all',
              cursor: 'grab',
            }}
            className="nodrag nopan"
            onMouseDown={onHandleMouseDown}
            onDoubleClick={onHandleDoubleClick}
            title="Drag to bend edge. Double-click to reset."
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: '#6366f1',
                border: '2px solid white',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }}
            />
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
});
