import { useState, useEffect, useCallback } from 'react';
import type { StatusCategory, WorkflowStatus, WorkflowTransition } from '@weaver/shared';
import { useUpdateWorkflowStatus, useUpdateWorkflowTransition } from '@/api/hooks-admin';

interface EditPanelProps {
  workflowId: string;
  selectedStatus: WorkflowStatus | null;
  selectedTransition: WorkflowTransition | null;
  onClose: () => void;
}

export function EditPanel({
  workflowId,
  selectedStatus,
  selectedTransition,
  onClose,
}: EditPanelProps) {
  const isOpen = !!(selectedStatus || selectedTransition);

  if (!isOpen) return null;

  return (
    <div className="absolute right-0 top-0 z-40 h-full w-72 border-l border-gray-200 bg-white shadow-lg">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">
            {selectedStatus ? 'Edit Status' : 'Edit Transition'}
          </h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {selectedStatus && (
            <StatusEditForm
              workflowId={workflowId}
              status={selectedStatus}
              onClose={onClose}
            />
          )}
          {selectedTransition && (
            <TransitionEditForm
              workflowId={workflowId}
              transition={selectedTransition}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StatusEditForm({
  workflowId,
  status,
  onClose,
}: {
  workflowId: string;
  status: WorkflowStatus;
  onClose: () => void;
}) {
  const [name, setName] = useState(status.name);
  const [category, setCategory] = useState<StatusCategory>(status.category);
  const [color, setColor] = useState(status.color);
  const [isInitial, setIsInitial] = useState(status.isInitial);
  const [isTerminal, setIsTerminal] = useState(status.isTerminal);
  const updateStatus = useUpdateWorkflowStatus();

  useEffect(() => {
    setName(status.name);
    setCategory(status.category);
    setColor(status.color);
    setIsInitial(status.isInitial);
    setIsTerminal(status.isTerminal);
  }, [status]);

  const handleSave = useCallback(() => {
    updateStatus.mutate(
      {
        workflowId,
        statusId: status.id,
        name,
        category,
        color,
        isInitial,
        isTerminal,
      },
      { onSuccess: onClose },
    );
  }, [workflowId, status.id, name, category, color, isInitial, isTerminal, updateStatus, onClose]);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-700">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as StatusCategory)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700">Color</label>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-8 w-8 cursor-pointer rounded border border-gray-300"
          />
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="block w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1.5 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={isInitial}
            onChange={(e) => setIsInitial(e.target.checked)}
            className="rounded border-gray-300"
          />
          Initial
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={isTerminal}
            onChange={(e) => setIsTerminal(e.target.checked)}
            className="rounded border-gray-300"
          />
          Terminal
        </label>
      </div>

      <button
        onClick={handleSave}
        disabled={updateStatus.isPending}
        className="w-full rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {updateStatus.isPending ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}

function TransitionEditForm({
  workflowId,
  transition,
  onClose,
}: {
  workflowId: string;
  transition: WorkflowTransition;
  onClose: () => void;
}) {
  const [name, setName] = useState(transition.name);
  const updateTransition = useUpdateWorkflowTransition();

  useEffect(() => {
    setName(transition.name);
  }, [transition]);

  const handleSave = useCallback(() => {
    updateTransition.mutate(
      { workflowId, transitionId: transition.id, name },
      { onSuccess: onClose },
    );
  }, [workflowId, transition.id, name, updateTransition, onClose]);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-700">
          Transition Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={updateTransition.isPending}
        className="w-full rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {updateTransition.isPending ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}
