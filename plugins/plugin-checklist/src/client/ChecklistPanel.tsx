import { CheckSquare, Square, Plus, Trash2, ChevronUp, ChevronDown, Pencil } from 'lucide-react';
import { useChecklist, type ChecklistApi } from './useChecklist';

interface ChecklistPanelProps {
  api: ChecklistApi;
}

export function ChecklistPanel({ api }: ChecklistPanelProps) {
  const {
    items,
    loading,
    newSubject,
    setNewSubject,
    editingId,
    editText,
    setEditText,
    editInputRef,
    doneCount,
    totalCount,
    percent,
    handleAdd,
    handleToggle,
    handleDelete,
    startEdit,
    saveEdit,
    handleEditKeyDown,
    handleMoveUp,
    handleMoveDown,
  } = useChecklist(api);

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-400">Loading checklist...</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Checklist</h3>
        {totalCount > 0 && (
          <span className="text-xs text-gray-500">
            {doneCount}/{totalCount} ({percent}%)
          </span>
        )}
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-green-500 transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}

      {/* Items list */}
      {items.length > 0 && (
        <ul className="mb-3 space-y-1">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-gray-50"
            >
              <div className="flex flex-col opacity-0 group-hover:opacity-100">
                <button
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0}
                  className="text-gray-400 hover:text-gray-600 disabled:invisible"
                  title="Move up"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  onClick={() => handleMoveDown(index)}
                  disabled={index >= items.length - 1}
                  className="text-gray-400 hover:text-gray-600 disabled:invisible"
                  title="Move down"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>

              <button
                onClick={() => handleToggle(item)}
                className="shrink-0 text-gray-500 hover:text-indigo-600"
              >
                {item.is_done ? (
                  <CheckSquare className="h-4 w-4 text-green-600" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </button>

              {editingId === item.id ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={saveEdit}
                  onKeyDown={handleEditKeyDown}
                  className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-0.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              ) : (
                <span
                  onDoubleClick={() => startEdit(item)}
                  className={`min-w-0 flex-1 cursor-default text-sm ${
                    item.is_done ? 'text-gray-400 line-through' : 'text-gray-900'
                  }`}
                >
                  {item.subject}
                </span>
              )}

              <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100">
                <button
                  onClick={() => startEdit(item)}
                  className="rounded p-0.5 text-gray-400 hover:text-indigo-600"
                  title="Edit"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="rounded p-0.5 text-gray-400 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Add form */}
      <form onSubmit={handleAdd} className="flex items-center gap-2">
        <Plus className="h-4 w-4 shrink-0 text-gray-400" />
        <input
          type="text"
          value={newSubject}
          onChange={(e) => setNewSubject(e.target.value)}
          placeholder="Add item..."
          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={!newSubject.trim()}
          className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </div>
  );
}
