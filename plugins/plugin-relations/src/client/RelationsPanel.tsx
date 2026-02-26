import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Plus, Trash2, Link2, Search, X } from 'lucide-react';
import { useRelations, type RelationsApi, type SearchResult } from './useRelations';

const LINK_TYPE_OPTIONS = [
  { value: 'blocks', label: 'blocks' },
  { value: 'is_blocked_by', label: 'is blocked by' },
  { value: 'relates_to', label: 'relates to' },
  { value: 'duplicates', label: 'duplicates' },
  { value: 'is_duplicated_by', label: 'is duplicated by' },
  { value: 'causes', label: 'causes' },
  { value: 'is_caused_by', label: 'is caused by' },
  { value: 'clones', label: 'clones' },
  { value: 'is_cloned_from', label: 'is cloned from' },
];

const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-gray-400',
  in_progress: 'bg-blue-500',
  done: 'bg-green-500',
};

interface RelationsPanelProps {
  api: RelationsApi;
  issueKey: string;
}

export function RelationsPanel({ api, issueKey }: RelationsPanelProps) {
  const { grouped, loading, addRelation, removeRelation, searchIssues } = useRelations(api);
  const [showForm, setShowForm] = useState(false);
  const [linkType, setLinkType] = useState('relates_to');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (value: string) => {
    setQuery(value);
    setSelectedIssue(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchIssues(value.trim());
        setResults(Array.isArray(data) ? data : []);
        setShowDropdown(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const handleSelectIssue = (result: SearchResult) => {
    setSelectedIssue(result);
    setQuery(result.key);
    setShowDropdown(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedIssue) return;

    setSubmitting(true);
    try {
      await addRelation(selectedIssue.key, linkType);
      setShowForm(false);
      setQuery('');
      setSelectedIssue(null);
      setLinkType('relates_to');
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setQuery('');
    setSelectedIssue(null);
    setResults([]);
    setShowDropdown(false);
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-400">Loading relations...</p>
      </div>
    );
  }

  const groupEntries = Object.entries(grouped);
  const hasRelations = groupEntries.length > 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Relations</h3>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              setShowForm(true);
              setTimeout(() => searchRef.current?.focus(), 50);
            }}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        )}
      </div>

      {/* Grouped relations list */}
      {hasRelations && (
        <div className="mb-3 space-y-2">
          {groupEntries.map(([label, rels]) => (
            <div key={label}>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                {label}
              </p>
              <ul className="space-y-0.5">
                {rels.map((rel) => (
                  <li
                    key={rel.id}
                    className="group flex items-center gap-2 rounded px-2 py-1 hover:bg-gray-50"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        STATUS_COLORS[rel.relatedIssue.statusCategory ?? ''] ?? 'bg-gray-300'
                      }`}
                      title={rel.relatedIssue.statusName ?? undefined}
                    />
                    <a
                      href={`/projects/${rel.relatedIssue.projectKey}/issues/${rel.relatedIssue.key}`}
                      className="shrink-0 text-xs font-medium text-indigo-600 hover:underline"
                    >
                      {rel.relatedIssue.key}
                    </a>
                    <span className="min-w-0 flex-1 truncate text-xs text-gray-700">
                      {rel.relatedIssue.summary}
                    </span>
                    {rel.relatedIssue.projectKey !== issueKey.split('-')[0] && (
                      <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                        {rel.relatedIssue.projectKey}
                      </span>
                    )}
                    <button
                      onClick={() => removeRelation(rel.id)}
                      className="shrink-0 rounded p-0.5 text-gray-400 opacity-0 hover:text-red-600 group-hover:opacity-100"
                      title="Remove relation"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!hasRelations && !showForm && (
        <p className="mb-3 text-xs text-gray-400">No relations yet</p>
      )}

      {/* Add relation form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-2 rounded border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs text-gray-600">{issueKey}</span>
            <select
              value={linkType}
              onChange={(e) => setLinkType(e.target.value)}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {LINK_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div ref={dropdownRef} className="relative">
            <div className="flex items-center gap-1">
              <Search className="h-3 w-3 shrink-0 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search issues by key or summary..."
                className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-xs placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {selectedIssue && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedIssue(null);
                    setQuery('');
                    searchRef.current?.focus();
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {showDropdown && results.length > 0 && (
              <div className="absolute top-full z-10 mt-1 max-h-48 w-full overflow-auto rounded border border-gray-200 bg-white shadow-lg">
                {results.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => handleSelectIssue(r)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        STATUS_COLORS[r.statusCategory ?? ''] ?? 'bg-gray-300'
                      }`}
                    />
                    <span className="shrink-0 text-xs font-medium text-indigo-600">{r.key}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-gray-600">{r.summary}</span>
                  </button>
                ))}
              </div>
            )}

            {showDropdown && !searching && results.length === 0 && query.length >= 2 && (
              <div className="absolute top-full z-10 mt-1 w-full rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-400 shadow-lg">
                No issues found
              </div>
            )}

            {searching && (
              <div className="absolute top-full z-10 mt-1 w-full rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-400 shadow-lg">
                Searching...
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded px-3 py-1 text-xs text-gray-600 hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedIssue || submitting}
              className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? 'Adding...' : 'Add relation'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
