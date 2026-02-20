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
): Edge<TransitionEdgeData>[] {
  return useMemo(() => {
    return transitions.map((t) => ({
      id: t.id,
      type: 'floating',
      source: t.fromStatusId,
      target: t.toStatusId,
      data: {
        transition: t,
        onDelete,
        waypoint: edgeWaypoints[t.id] ?? null,
        onWaypointChange,
      },
    }));
  }, [transitions, onDelete, edgeWaypoints, onWaypointChange]);
}
