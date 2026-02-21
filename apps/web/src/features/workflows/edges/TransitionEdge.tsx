import { memo, useCallback, useRef } from 'react';
import {
  EdgeLabelRenderer,
  getSmoothStepPath,
  useInternalNode,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react';
import type { TransitionEdgeData } from '../hooks/useWorkflowEdges';
import { getEdgeParams } from '../utils/floatingEdge';

export const TransitionEdge: React.NamedExoticComponent<
  EdgeProps & { data: TransitionEdgeData }
> = memo(function TransitionEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceHandleId,
  targetHandleId,
  data,
  selected,
}: EdgeProps & { data: TransitionEdgeData }) {
  const { screenToFlowPosition } = useReactFlow();
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!sourceNode || !targetNode) {
    return null;
  }

  // If the edge has specific handles assigned, use ReactFlow's provided positions.
  // Otherwise, calculate floating positions (closest handle).
  let sx: number, sy: number, tx: number, ty: number;
  let sPos = sourcePosition;
  let tPos = targetPosition;

  if (sourceHandleId && targetHandleId) {
    sx = sourceX;
    sy = sourceY;
    tx = targetX;
    ty = targetY;
  } else {
    const params = getEdgeParams(sourceNode, targetNode);
    sx = params.sx;
    sy = params.sy;
    tx = params.tx;
    ty = params.ty;
    sPos = params.sourcePos;
    tPos = params.targetPos;
  }

  const waypoint = data?.waypoint;

  let edgePath: string;
  let handleX: number;
  let handleY: number;

  if (waypoint) {
    const [path1] = getSmoothStepPath({
      sourceX: sx,
      sourceY: sy,
      targetX: waypoint.x,
      targetY: waypoint.y,
      sourcePosition: sPos,
      targetPosition: tPos,
      borderRadius: 8,
      offset: 16,
    });
    const [path2] = getSmoothStepPath({
      sourceX: waypoint.x,
      sourceY: waypoint.y,
      targetX: tx,
      targetY: ty,
      sourcePosition: sPos,
      targetPosition: tPos,
      borderRadius: 8,
      offset: 16,
    });
    edgePath = path1 + ' ' + path2.replace(/^M/, 'L');
    handleX = waypoint.x;
    handleY = waypoint.y;
  } else {
    const [path, lx, ly] = getSmoothStepPath({
      sourceX: sx,
      sourceY: sy,
      targetX: tx,
      targetY: ty,
      sourcePosition: sPos,
      targetPosition: tPos,
      borderRadius: 8,
      offset: 20,
    });
    edgePath = path;
    handleX = lx;
    handleY = ly;
  }

  const labelX = handleX;
  const labelY = handleY - 18;

  const strokeColor = selected ? '#6366f1' : '#94a3b8';
  const markerId = `arrow-${id}`;

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
      data?.onWaypointChange?.(id, null);
    },
    [id, data],
  );

  return (
    <>
      {/* Per-edge arrow marker — orient="auto" follows the path direction */}
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={strokeColor} />
        </marker>
      </defs>

      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={selected ? 2.5 : 1.5}
        markerEnd={`url(#${markerId})`}
        className="react-flow__edge-path"
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
