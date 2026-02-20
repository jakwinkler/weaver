import { useCallback, useRef } from 'react';

const NODE_STORAGE_PREFIX = 'weaver:workflow-positions:';
const EDGE_STORAGE_PREFIX = 'weaver:workflow-edge-waypoints:';

type PositionMap = Record<string, { x: number; y: number }>;

export function useWorkflowPositions(workflowId: string) {
  const nodeKey = NODE_STORAGE_PREFIX + workflowId;
  const edgeKey = EDGE_STORAGE_PREFIX + workflowId;
  const nodeCacheRef = useRef<PositionMap | null>(null);
  const edgeCacheRef = useRef<PositionMap | null>(null);

  // ── Node positions ──

  const getPositions = useCallback((): PositionMap | null => {
    if (nodeCacheRef.current) return nodeCacheRef.current;
    try {
      const raw = localStorage.getItem(nodeKey);
      if (raw) {
        const parsed = JSON.parse(raw) as PositionMap;
        nodeCacheRef.current = parsed;
        return parsed;
      }
    } catch {
      // ignore
    }
    return null;
  }, [nodeKey]);

  const savePositions = useCallback(
    (positions: PositionMap) => {
      nodeCacheRef.current = positions;
      try {
        localStorage.setItem(nodeKey, JSON.stringify(positions));
      } catch {
        // ignore quota errors
      }
    },
    [nodeKey],
  );

  const updatePosition = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      const current = getPositions() ?? {};
      const next = { ...current, [nodeId]: position };
      savePositions(next);
    },
    [getPositions, savePositions],
  );

  const clearPositions = useCallback(() => {
    nodeCacheRef.current = null;
    edgeCacheRef.current = null;
    try {
      localStorage.removeItem(nodeKey);
      localStorage.removeItem(edgeKey);
    } catch {
      // ignore
    }
  }, [nodeKey, edgeKey]);

  // ── Edge waypoints ──

  const getEdgeWaypoints = useCallback((): PositionMap => {
    if (edgeCacheRef.current) return edgeCacheRef.current;
    try {
      const raw = localStorage.getItem(edgeKey);
      if (raw) {
        const parsed = JSON.parse(raw) as PositionMap;
        edgeCacheRef.current = parsed;
        return parsed;
      }
    } catch {
      // ignore
    }
    return {};
  }, [edgeKey]);

  const updateEdgeWaypoint = useCallback(
    (edgeId: string, position: { x: number; y: number } | null) => {
      const current = getEdgeWaypoints();
      const next = { ...current };
      if (position === null) {
        delete next[edgeId];
      } else {
        next[edgeId] = position;
      }
      edgeCacheRef.current = next;
      try {
        localStorage.setItem(edgeKey, JSON.stringify(next));
      } catch {
        // ignore
      }
    },
    [edgeKey, getEdgeWaypoints],
  );

  return {
    getPositions,
    savePositions,
    updatePosition,
    clearPositions,
    getEdgeWaypoints,
    updateEdgeWaypoint,
  };
}
