import { useState } from 'react';
import { useBulkUpdateIssues, useBulkDeleteIssues } from '@/api/hooks-phase6';
import type { IssuePriority } from '@weaver/shared';

interface BulkOperationsProps {
  selectedKeys: string[];
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

type DropdownType = 'status' | 'priority' | 'assign' | null;

const STATUSES = ['open', 'in_progress', 'in_review', 'done', 'closed'];
const PRIORITIES: IssuePriority[] = ['lowest', 'low', 'medium', 'high', 'highest'];

export function BulkOperations({
  selectedKeys,
  totalCount,
  onSelectAll,
  onDeselectAll,
}: BulkOperationsProps) {
  const [activeDropdown, setActiveDropdown] = useState<DropdownType>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const bulkUpdate = useBulkUpdateIssues();
  const bulkDelete = useBulkDeleteIssues();

  if (selectedKeys.length === 0) {
    return null;
  }

  const toggleDropdown = (type: DropdownType) => {
    setActiveDropdown(activeDropdown === type ? null : type);
    setConfirmDelete(false);
  };

  const handleStatusChange = async (status: string) => {
    await bulkUpdate.mutateAsync({ issueKeys: selectedKeys, updates: { statusId: status } });
    setActiveDropdown(null);
  };

  const handlePriorityChange = async (priority: IssuePriority) => {
    await bulkUpdate.mutateAsync({ issueKeys: selectedKeys, updates: { priority } });
    setActiveDropdown(null);
  };

  const handleAssign = async (assigneeId: string) => {
    await bulkUpdate.mutateAsync({
      issueKeys: selectedKeys,
      updates: { assigneeId: assigneeId || null },
    });
    setActiveDropdown(null);
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await bulkDelete.mutateAsync(selectedKeys);
    setConfirmDelete(false);
    setActiveDropdown(null);
    onDeselectAll();
  };

  const isPending = bulkUpdate.isPending || bulkDelete.isPending;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
      <span className="text-sm font-medium text-indigo-700">
        {selectedKeys.length} of {totalCount} selected
      </span>

      <div className="flex items-center gap-1">
        <button
          onClick={onSelectAll}
          className="rounded px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-100"
        >
          Select All
        </button>
        <span className="text-gray-300">|</span>
        <button
          onClick={onDeselectAll}
          className="rounded px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-100"
        >
          Deselect All
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Change Status */}
        <div className="relative">
          <button
            onClick={() => toggleDropdown('status')}
            disabled={isPending}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Change Status
          </button>
          {activeDropdown === 'status' && (
            <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
              {STATUSES.map((status) => (
                <button
                  key={status}
                  onClick={() => handleStatusChange(status)}
                  className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                >
                  {status.replace('_', ' ')}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Change Priority */}
        <div className="relative">
          <button
            onClick={() => toggleDropdown('priority')}
            disabled={isPending}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Change Priority
          </button>
          {activeDropdown === 'priority' && (
            <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
              {PRIORITIES.map((priority) => (
                <button
                  key={priority}
                  onClick={() => handlePriorityChange(priority)}
                  className="block w-full px-4 py-2 text-left text-sm capitalize text-gray-700 hover:bg-gray-100"
                >
                  {priority}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Assign */}
        <div className="relative">
          <button
            onClick={() => toggleDropdown('assign')}
            disabled={isPending}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Assign
          </button>
          {activeDropdown === 'assign' && (
            <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
              <button
                onClick={() => handleAssign('')}
                className="block w-full px-4 py-2 text-left text-sm text-gray-500 hover:bg-gray-100"
              >
                Unassigned
              </button>
              <p className="px-4 py-2 text-xs text-gray-400">
                Enter a user ID to assign:
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.target as HTMLFormElement;
                  const input = form.elements.namedItem('assigneeId') as HTMLInputElement;
                  if (input.value.trim()) {
                    handleAssign(input.value.trim());
                  }
                }}
                className="px-4 pb-2"
              >
                <input
                  name="assigneeId"
                  type="text"
                  placeholder="User ID"
                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </form>
            </div>
          )}
        </div>

        {/* Delete */}
        <button
          onClick={handleDelete}
          disabled={isPending}
          className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
            confirmDelete
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'border border-red-300 text-red-600 hover:bg-red-50'
          }`}
        >
          {confirmDelete ? 'Confirm Delete' : 'Delete'}
        </button>
      </div>

      {isPending && (
        <div className="ml-2 text-sm text-gray-500">Processing...</div>
      )}
    </div>
  );
}
