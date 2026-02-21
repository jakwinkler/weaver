import { useCallback, useMemo, useRef } from 'react';

const NODE_STORAGE_PREFIX = 'weaver:workflow-positions:';
const EDGE_STORAGE_PREFIX = 'weaver:workflow-edge-waypoints:';
const HANDLE_STORAGE_PREFIX = 'weaver:workflow-edge-handles:';

type PositionMap = Record<string, { x: number; y: number }>;
type HandleMap = Record<string, { sourceHandle: string; targetHandle: string }>;

export function useWorkflowPositions(workflowId: string) {
  const nodeKey = NODE_STORAGE_PREFIX + workflowId;
  const edgeKey = EDGE_STORAGE_PREFIX + workflowId;
  const handleKey = HANDLE_STORAGE_PREFIX + workflowId;
  const nodeCacheRef = useRef<PositionMap | null>(null);
  const edgeCacheRef = useRef<PositionMap | null>(null);
  const handleCacheRef = useRef<HandleMap | null>(null);

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
    handleCacheRef.current = null;
    try {
      localStorage.removeItem(nodeKey);
      localStorage.removeItem(edgeKey);
      localStorage.removeItem(handleKey);
    } catch {
      // ignore
    }
  }, [nodeKey, edgeKey, handleKey]);

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

  // ── Edge connection handles ──

  const getEdgeHandles = useCallback((): HandleMap => {
    if (handleCacheRef.current) return handleCacheRef.current;
    try {
      const raw = localStorage.getItem(handleKey);
      if (raw) {
        const parsed = JSON.parse(raw) as HandleMap;
        // Clean up stale handle IDs from old 8-handle layout (source-top, target-bottom, etc.)
        const validHandles = new Set(['top', 'right', 'bottom', 'left']);
        const cleaned: HandleMap = {};
        let needsClean = false;
        for (const [edgeId, handles] of Object.entries(parsed)) {
          if (validHandles.has(handles.sourceHandle) && validHandles.has(handles.targetHandle)) {
            cleaned[edgeId] = handles;
          } else {
            needsClean = true;
          }
        }
        if (needsClean) {
          localStorage.setItem(handleKey, JSON.stringify(cleaned));
        }
        handleCacheRef.current = cleaned;
        return cleaned;
      }
    } catch {
      // ignore
    }
    return {};
  }, [handleKey]);

  const saveEdgeHandle = useCallback(
    (edgeId: string, sourceHandle: string, targetHandle: string) => {
      const current = getEdgeHandles();
      const next = { ...current, [edgeId]: { sourceHandle, targetHandle } };
      handleCacheRef.current = next;
      try {
        localStorage.setItem(handleKey, JSON.stringify(next));
      } catch {
        // ignore
      }
    },
    [handleKey, getEdgeHandles],
  );

  return useMemo(() => ({
    getPositions,
    savePositions,
    updatePosition,
    clearPositions,
    getEdgeWaypoints,
    updateEdgeWaypoint,
    getEdgeHandles,
    saveEdgeHandle,
  }), [getPositions, savePositions, updatePosition, clearPositions, getEdgeWaypoints, updateEdgeWaypoint, getEdgeHandles, saveEdgeHandle]);
}
