import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useWorkflow } from '@/api/hooks-phase2';
import { WorkflowEditorHeader } from './WorkflowEditorHeader';
import { WorkflowCanvas } from './WorkflowCanvas';
import { AddStatusPanel } from './panels/AddStatusPanel';

export function WorkflowEditor() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const { data: workflow, isLoading } = useWorkflow(workflowId!);
  const [addStatusOpen, setAddStatusOpen] = useState(false);
  const [autoLayoutTrigger, setAutoLayoutTrigger] = useState(0);

  const handleAutoLayout = useCallback(() => {
    setAutoLayoutTrigger((t) => t + 1);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Loading workflow...</p>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Workflow not found.</p>
      </div>
    );
  }

  const statuses = workflow.statuses || [];
  const transitions = workflow.transitions || [];

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 7.5rem)' }}>
      <WorkflowEditorHeader
        workflowName={workflow.name}
        isDefault={workflow.isDefault}
        onAddStatus={() => setAddStatusOpen(true)}
        onAutoLayout={handleAutoLayout}
      />

      <div className="relative min-h-0 flex-1">
        <WorkflowCanvas
          workflowId={workflowId!}
          statuses={statuses}
          transitions={transitions}
          autoLayoutTrigger={autoLayoutTrigger}
        />

        <AddStatusPanel
          workflowId={workflowId!}
          open={addStatusOpen}
          onClose={() => setAddStatusOpen(false)}
        />
      </div>
    </div>
  );
}
