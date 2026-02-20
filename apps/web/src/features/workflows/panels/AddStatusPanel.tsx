import { useState, type FormEvent } from 'react';
import type { StatusCategory } from '@weaver/shared';
import { useAddWorkflowStatus } from '@/api/hooks-admin';

interface AddStatusPanelProps {
  workflowId: string;
  open: boolean;
  onClose: () => void;
}

export function AddStatusPanel({ workflowId, open, onClose }: AddStatusPanelProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<StatusCategory>('todo');
  const [color, setColor] = useState('#3B82F6');
  const [isInitial, setIsInitial] = useState(false);
  const [isTerminal, setIsTerminal] = useState(false);
  const addStatus = useAddWorkflowStatus();

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    addStatus.mutate(
      { workflowId, name, category, color, isInitial, isTerminal },
      {
        onSuccess: () => {
          setName('');
          setColor('#3B82F6');
          setIsInitial(false);
          setIsTerminal(false);
          onClose();
        },
      },
    );
  };

  return (
    <div className="absolute left-4 top-16 z-50 w-72 rounded-lg border border-gray-200 bg-white shadow-xl">
      <form onSubmit={handleSubmit} className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Add Status</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700">Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. In Review"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              autoFocus
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
                pattern="^#[0-9a-fA-F]{6}$"
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
            type="submit"
            disabled={addStatus.isPending}
            className="w-full rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {addStatus.isPending ? 'Adding...' : 'Add Status'}
          </button>
        </div>
      </form>
    </div>
  );
}
