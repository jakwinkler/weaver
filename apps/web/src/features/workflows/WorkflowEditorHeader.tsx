import { Link } from 'react-router-dom';

interface WorkflowEditorHeaderProps {
  workflowName: string;
  isDefault: boolean;
  onAddStatus: () => void;
  onAutoLayout: () => void;
}

export function WorkflowEditorHeader({
  workflowName,
  isDefault,
  onAddStatus,
  onAutoLayout,
}: WorkflowEditorHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <Link to="/admin/workflows" className="hover:text-indigo-600">
            Workflows
          </Link>
          <span>/</span>
          <span className="font-medium text-gray-900">{workflowName}</span>
        </div>
        {isDefault && (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
            Default
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onAutoLayout}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Auto Layout
        </button>
        <button
          onClick={onAddStatus}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + Add Status
        </button>
      </div>
    </div>
  );
}
