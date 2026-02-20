import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ConnectionMode,
  useNodesState,
  useEdgesState,
  type OnConnect,
  type Connection,
  type NodeMouseHandler,
  type Node,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { WorkflowStatus, WorkflowTransition, StatusCategory } from '@weaver/shared';
import {
  useAddWorkflowTransition,
  useDeleteWorkflowStatus,
  useDeleteWorkflowTransition,
  useUpdateWorkflowStatus,
} from '@/api/hooks-admin';
import { StatusNode } from './nodes/StatusNode';
import { TransitionEdge } from './edges/TransitionEdge';
import { useWorkflowNodes, type StatusNodeData } from './hooks/useWorkflowNodes';
import { useWorkflowEdges } from './hooks/useWorkflowEdges';
import { useWorkflowPositions } from './hooks/useWorkflowPositions';
import { autoLayout } from './utils/autoLayout';
import { ConnectionDialog } from './panels/ConnectionDialog';
import { EditPanel } from './panels/EditPanel';
import { ContextMenu } from './panels/ContextMenu';

const nodeTypes = { status: StatusNode };
const edgeTypes = { floating: TransitionEdge };

const MINIMAP_CATEGORY_COLORS: Record<StatusCategory, string> = {
  todo: '#93c5fd',
  in_progress: '#fcd34d',
  done: '#6ee7b7',
};

interface WorkflowCanvasProps {
  workflowId: string;
  statuses: WorkflowStatus[];
  transitions: WorkflowTransition[];
  autoLayoutTrigger: number;
}

export function WorkflowCanvas({
  workflowId,
  statuses,
  transitions,
  autoLayoutTrigger,
}: WorkflowCanvasProps) {
  const positions = useWorkflowPositions(workflowId);
  const savedPositions = positions.getPositions();
  const [edgeWaypoints, setEdgeWaypoints] = useState<Record<string, { x: number; y: number }>>(
    () => positions.getEdgeWaypoints(),
  );

  const handleDeleteTransition = useCallback(
    (transitionId: string) => {
      deleteTransitionMutation.mutate({ workflowId, transitionId });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workflowId],
  );

  const handleWaypointChange = useCallback(
    (edgeId: string, position: { x: number; y: number } | null) => {
      if (position === null) {
        setEdgeWaypoints((prev) => {
          const next = { ...prev };
          delete next[edgeId];
          return next;
        });
      } else {
        setEdgeWaypoints((prev) => ({ ...prev, [edgeId]: position }));
      }
      positions.updateEdgeWaypoint(edgeId, position);
    },
    [positions],
  );

  const derivedNodes = useWorkflowNodes(statuses, savedPositions);
  const derivedEdges = useWorkflowEdges(transitions, handleDeleteTransition, edgeWaypoints, handleWaypointChange);

  const [nodes, setNodes, onNodesChange] = useNodesState(derivedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(derivedEdges);

  // Sync derived nodes into RF state, preserving current dragged positions
  useEffect(() => {
    setNodes((current) => {
      const posMap = Object.fromEntries(
        current.map((n) => [n.id, n.position]),
      );
      return derivedNodes.map((n) => ({
        ...n,
        position: posMap[n.id] ?? n.position,
      }));
    });
  }, [derivedNodes, setNodes]);

  useEffect(() => {
    setEdges(derivedEdges);
  }, [derivedEdges, setEdges]);

  // Auto layout trigger
  const prevTrigger = useRef(autoLayoutTrigger);
  useEffect(() => {
    if (autoLayoutTrigger !== prevTrigger.current) {
      prevTrigger.current = autoLayoutTrigger;
      positions.clearPositions();
      const newPositions = autoLayout(statuses);
      positions.savePositions(newPositions);
      setNodes((current) =>
        current.map((n) => ({
          ...n,
          position: newPositions[n.id] ?? n.position,
        })),
      );
    }
  }, [autoLayoutTrigger, statuses, positions, setNodes]);

  // Mutations
  const addTransition = useAddWorkflowTransition();
  const deleteStatusMutation = useDeleteWorkflowStatus();
  const deleteTransitionMutation = useDeleteWorkflowTransition();
  const updateStatusMutation = useUpdateWorkflowStatus();

  // Connection dialog state
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);
  const [connectionDialogPos, setConnectionDialogPos] = useState({ x: 0, y: 0 });

  // Edit panel state
  const [selectedStatus, setSelectedStatus] = useState<WorkflowStatus | null>(null);
  const [selectedTransition, setSelectedTransition] = useState<WorkflowTransition | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    nodeId: string;
    position: { x: number; y: number };
  } | null>(null);

  const onConnect: OnConnect = useCallback(
    (connection) => {
      setPendingConnection(connection);
      setConnectionDialogPos({ x: window.innerWidth / 2, y: 200 });
    },
    [],
  );

  const handleConnectionConfirm = useCallback(
    (name: string) => {
      if (!pendingConnection?.source || !pendingConnection?.target) return;
      addTransition.mutate({
        workflowId,
        name,
        fromStatusId: pendingConnection.source,
        toStatusId: pendingConnection.target,
      });
      setPendingConnection(null);
    },
    [pendingConnection, workflowId, addTransition],
  );

  const handleConnectionCancel = useCallback(() => {
    setPendingConnection(null);
  }, []);

  // Save position on drag stop
  const onNodeDragStop: NodeMouseHandler = useCallback(
    (_event, node) => {
      positions.updatePosition(node.id, node.position);
    },
    [positions],
  );

  // Node click → open edit panel
  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      setSelectedTransition(null);
      const status = statuses.find((s) => s.id === node.id);
      setSelectedStatus(status ?? null);
    },
    [statuses],
  );

  // Edge click → open edit panel
  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: { id: string }) => {
      setSelectedStatus(null);
      const transition = transitions.find((t) => t.id === edge.id);
      setSelectedTransition(transition ?? null);
    },
    [transitions],
  );

  // Right-click on node → context menu
  const onNodeContextMenu: NodeMouseHandler = useCallback(
    (event, node) => {
      event.preventDefault();
      setContextMenu({
        nodeId: node.id,
        position: { x: event.clientX, y: event.clientY },
      });
    },
    [],
  );

  // Delete key handling
  const onNodesDelete = useCallback(
    (deletedNodes: Node[]) => {
      for (const node of deletedNodes) {
        deleteStatusMutation.mutate({ workflowId, statusId: node.id });
      }
    },
    [workflowId, deleteStatusMutation],
  );

  const onEdgesDelete = useCallback(
    (deletedEdges: { id: string }[]) => {
      for (const edge of deletedEdges) {
        deleteTransitionMutation.mutate({ workflowId, transitionId: edge.id });
      }
    },
    [workflowId, deleteTransitionMutation],
  );

  // Close edit panel on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedStatus(null);
        setSelectedTransition(null);
        setContextMenu(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const contextMenuStatus = contextMenu
    ? statuses.find((s) => s.id === contextMenu.nodeId)
    : null;

  const minimapNodeColor = useCallback(
    (node: Node<StatusNodeData>) => {
      const status = (node.data as StatusNodeData)?.status;
      if (status) return MINIMAP_CATEGORY_COLORS[status.category] ?? '#94a3b8';
      return '#94a3b8';
    },
    [],
  );

  const defaultEdgeOptions = useMemo(() => ({ type: 'floating' as const }), []);

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ contain: 'strict' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onNodeContextMenu={onNodeContextMenu}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        deleteKeyCode={['Delete', 'Backspace']}
        selectNodesOnDrag={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
        <Controls position="bottom-left" />
        <MiniMap
          position="bottom-right"
          nodeColor={minimapNodeColor}
          maskColor="rgba(0,0,0,0.08)"
          style={{ border: '1px solid #e2e8f0', borderRadius: 8 }}
        />

        {/* Arrow marker definition */}
        <svg style={{ position: 'absolute', width: 0, height: 0 }}>
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
            </marker>
          </defs>
        </svg>
      </ReactFlow>

      {/* Connection dialog */}
      <ConnectionDialog
        open={!!pendingConnection}
        position={connectionDialogPos}
        onConfirm={handleConnectionConfirm}
        onCancel={handleConnectionCancel}
      />

      {/* Edit panel */}
      <EditPanel
        workflowId={workflowId}
        selectedStatus={selectedStatus}
        selectedTransition={selectedTransition}
        onClose={() => {
          setSelectedStatus(null);
          setSelectedTransition(null);
        }}
      />

      {/* Context menu */}
      {contextMenuStatus && contextMenu && (
        <ContextMenu
          open={!!contextMenu}
          position={contextMenu.position}
          isInitial={contextMenuStatus.isInitial}
          isTerminal={contextMenuStatus.isTerminal}
          onEdit={() => {
            setSelectedTransition(null);
            setSelectedStatus(contextMenuStatus);
          }}
          onDelete={() => {
            deleteStatusMutation.mutate({
              workflowId,
              statusId: contextMenu.nodeId,
            });
          }}
          onToggleInitial={() => {
            updateStatusMutation.mutate({
              workflowId,
              statusId: contextMenu.nodeId,
              isInitial: !contextMenuStatus.isInitial,
            });
          }}
          onToggleTerminal={() => {
            updateStatusMutation.mutate({
              workflowId,
              statusId: contextMenu.nodeId,
              isTerminal: !contextMenuStatus.isTerminal,
            });
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
