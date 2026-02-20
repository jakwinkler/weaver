import { useMemo } from 'react';
import type { Node } from '@xyflow/react';
import type { WorkflowStatus } from '@weaver/shared';
import { autoLayout } from '../utils/autoLayout';

export interface StatusNodeData extends Record<string, unknown> {
  status: WorkflowStatus;
}

export function useWorkflowNodes(
  statuses: WorkflowStatus[],
  savedPositions: Record<string, { x: number; y: number }> | null,
): Node<StatusNodeData>[] {
  return useMemo(() => {
    const layoutPositions =
      savedPositions && Object.keys(savedPositions).length > 0
        ? savedPositions
        : autoLayout(statuses);

    return statuses.map((status) => ({
      id: status.id,
      type: 'status',
      position: layoutPositions[status.id] ?? { x: 0, y: 0 },
      data: { status },
    }));
  }, [statuses, savedPositions]);
}
