import { useState, type FormEvent } from 'react';
import {
  useSearch,
  useSavedFilters,
  useCreateSavedFilter,
  useDeleteSavedFilter,
} from '@/api/hooks-phase3';

const WQL_EXAMPLES = [
  'priority = "high"',
  'priority = "high" AND label = "bug"',
  'status = "In Progress" AND assignee = "me"',
  'label IN ("bug", "feature")',
  'created > "2025-01-01"',
];

export function SearchPage() {
  const search = useSearch();
  const { data: savedFilters, isLoading: filtersLoading } = useSavedFilters();
  const createFilter = useCreateSavedFilter();
  const deleteFilter = useDeleteSavedFilter();

  const [query, setQuery] = useState('');
  const [filterName, setFilterName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    search.mutate({ query: query.trim() });
  };

  const handleLoadFilter = (filterQuery: string) => {
    setQuery(filterQuery);
    search.mutate({ query: filterQuery });
  };

  const handleSaveFilter = async (e: FormEvent) => {
    e.preventDefault();
    if (!filterName.trim() || !query.trim()) return;
    await createFilter.mutateAsync({
      name: filterName.trim(),
      query: query.trim(),
    });
    setFilterName('');
    setShowSaveForm(false);
  };

  const handleDeleteFilter = async (id: string) => {
    await deleteFilter.mutateAsync(id);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Search</h1>

      <div className="flex gap-6">
        {/* Sidebar - Saved Filters */}
        <div className="w-64 flex-shrink-0">
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Saved Filters</h2>
            </div>
            {filtersLoading ? (
              <div className="px-4 py-3">
                <p className="text-xs text-gray-500">Loading...</p>
              </div>
            ) : !savedFilters || savedFilters.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-gray-400">No saved filters.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {savedFilters.map((filter) => (
                  <div
                    key={filter.id}
                    className="flex items-center justify-between px-4 py-2"
                  >
                    <button
                      onClick={() => handleLoadFilter(filter.query)}
                      className="truncate text-left text-sm text-indigo-600 hover:text-indigo-800"
                      title={filter.query}
                    >
                      {filter.name}
                    </button>
                    <button
                      onClick={() => handleDeleteFilter(filter.id)}
                      className="ml-2 flex-shrink-0 rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-600"
                      title="Delete filter"
                    >
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1">
          {/* Search form */}
          <form onSubmit={handleSearch} className="mb-6">
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='e.g. priority = "high" AND label = "bug"'
                className="block flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={search.isPending || !query.trim()}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {search.isPending ? 'Searching...' : 'Search'}
              </button>
              <button
                type="button"
                onClick={() => setShowSaveForm(!showSaveForm)}
                disabled={!query.trim()}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Save Filter
              </button>
            </div>
          </form>

          {/* Save filter form */}
          {showSaveForm && (
            <form
              onSubmit={handleSaveFilter}
              className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4"
            >
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label
                    htmlFor="filterName"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Filter Name
                  </label>
                  <input
                    id="filterName"
                    type="text"
                    value={filterName}
                    onChange={(e) => setFilterName(e.target.value)}
                    placeholder="e.g. My high priority bugs"
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={createFilter.isPending || !filterName.trim()}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {createFilter.isPending ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSaveForm(false);
                    setFilterName('');
                  }}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
              {createFilter.isError && (
                <p className="mt-2 text-sm text-red-600">Failed to save filter.</p>
              )}
            </form>
          )}

          {/* Error state */}
          {search.isError && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">
                Search failed. Please check your query syntax and try again.
              </p>
            </div>
          )}

          {/* Results table */}
          {search.data && (
            <div className="mb-6 rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-6 py-3">
                <p className="text-sm text-gray-500">
                  {search.data.meta.total} result{search.data.meta.total !== 1 ? 's' : ''} found
                </p>
              </div>
              {search.data.data.length === 0 ? (
                <div className="px-6 py-8 text-center">
                  <p className="text-sm text-gray-400">
                    No issues match your query.
                  </p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Key
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Summary
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Priority
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {search.data.data.map((issue) => (
                      <tr key={issue.key} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-6 py-3 text-sm font-medium text-indigo-600">
                          {issue.key}
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-900">
                          {issue.summary}
                        </td>
                        <td className="whitespace-nowrap px-6 py-3">
                          <PriorityBadge priority={issue.priority} />
                        </td>
                        <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-700">
                          {issue.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* WQL Help */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">
              WQL Syntax Help
            </h3>
            <p className="mb-3 text-sm text-gray-600">
              Weaver Query Language (WQL) allows you to search issues using field
              comparisons and logical operators.
            </p>
            <div className="space-y-1">
              {WQL_EXAMPLES.map((example) => (
                <button
                  key={example}
                  onClick={() => setQuery(example)}
                  className="block w-full rounded px-2 py-1 text-left font-mono text-xs text-gray-600 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  {example}
                </button>
              ))}
            </div>
            <div className="mt-4 border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-500">
                <strong>Operators:</strong> =, !=, &gt;, &lt;, &gt;=, &lt;=, IN, NOT
                IN
              </p>
              <p className="text-xs text-gray-500">
                <strong>Logical:</strong> AND, OR
              </p>
              <p className="text-xs text-gray-500">
                <strong>Fields:</strong> priority, status, label, assignee, reporter,
                created, updated
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const PRIORITY_STYLES: Record<string, string> = {
  highest: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-blue-100 text-blue-800',
  lowest: 'bg-gray-100 text-gray-800',
};

function PriorityBadge({ priority }: { priority: string }) {
  const style = PRIORITY_STYLES[priority] || 'bg-gray-100 text-gray-800';
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {priority}
    </span>
  );
}
