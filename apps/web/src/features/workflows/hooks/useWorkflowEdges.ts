import { useMemo } from 'react';
import type { Edge } from '@xyflow/react';
import type { WorkflowTransition } from '@weaver/shared';

export interface TransitionEdgeData extends Record<string, unknown> {
  transition: WorkflowTransition;
  onDelete: (transitionId: string) => void;
  waypoint: { x: number; y: number } | null;
  onWaypointChange: (edgeId: string, position: { x: number; y: number } | null) => void;
}

export function useWorkflowEdges(
  transitions: WorkflowTransition[],
  onDelete: (transitionId: string) => void,
  edgeWaypoints: Record<string, { x: number; y: number }>,
  onWaypointChange: (edgeId: string, position: { x: number; y: number } | null) => void,
  edgeHandles: Record<string, { sourceHandle: string; targetHandle: string }>,
): Edge<TransitionEdgeData>[] {
  return useMemo(() => {
    return transitions.map((t) => {
      const handles = edgeHandles[t.id];
      return {
        id: t.id,
        type: 'floating',
        source: t.fromStatusId,
        target: t.toStatusId,
        // If handles were stored from the user's connection, use them
        ...(handles ? { sourceHandle: handles.sourceHandle, targetHandle: handles.targetHandle } : {}),
        data: {
          transition: t,
          onDelete,
          waypoint: edgeWaypoints[t.id] ?? null,
          onWaypointChange,
        },
      };
    });
  }, [transitions, onDelete, edgeWaypoints, onWaypointChange, edgeHandles]);
}
