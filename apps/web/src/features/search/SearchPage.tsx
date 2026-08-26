import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useSearch,
  useSavedFilters,
  useCreateSavedFilter,
  useDeleteSavedFilter,
} from '@/api/hooks-phase3';
import { Pagination, getStoredPerPage } from '@/components/Pagination';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const WQL_EXAMPLES = [
  'priority = "high"',
  'priority = "high" AND label = "bug"',
  'status = "In Progress" AND assignee = "me"',
  'label IN ("bug", "feature")',
  'created > "2025-01-01"',
];

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = useSearch();
  const { data: savedFilters, isLoading: filtersLoading } = useSavedFilters();
  const createFilter = useCreateSavedFilter();
  const deleteFilter = useDeleteSavedFilter();

  const page = Number(searchParams.get('page')) || 1;
  const perPage = Number(searchParams.get('perPage')) || getStoredPerPage();
  const urlQuery = searchParams.get('q')?.trim() || '';

  const [query, setQuery] = useState(urlQuery);
  const [filterName, setFilterName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(updates)) {
          if (value === undefined || value === '') {
            next.delete(key);
          } else {
            next.set(key, value);
          }
        }
        return next;
      });
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (!urlQuery) return;

    setQuery(urlQuery);
    search.mutate({ query: urlQuery, page, perPage });
  }, [urlQuery, page, perPage, search.mutate]);

  const runSearch = (nextQuery: string) => {
    const trimmedQuery = nextQuery.trim();
    if (!trimmedQuery) return;

    setQuery(trimmedQuery);
    if (trimmedQuery === urlQuery && page === 1) {
      search.mutate({ query: trimmedQuery, page: 1, perPage });
      return;
    }

    updateParams({ q: trimmedQuery, page: undefined });
  };

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    runSearch(query);
  };

  const handleLoadFilter = (filterQuery: string) => {
    runSearch(filterQuery);
  };

  const handlePageChange = (newPage: number) => {
    updateParams({ page: newPage === 1 ? undefined : String(newPage) });
  };

  const handlePerPageChange = (newPerPage: number) => {
    updateParams({ perPage: String(newPerPage), page: undefined });
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
    <div>
      <h1 className="mb-6 text-2xl font-bold text-foreground">Search</h1>

      <div className="flex gap-6">
        {/* Sidebar - Saved Filters */}
        <div className="w-64 flex-shrink-0">
          <Card>
            <CardHeader className="border-b border-border px-4 py-3">
              <CardTitle className="text-sm">Saved Filters</CardTitle>
            </CardHeader>
            {filtersLoading ? (
              <CardContent className="px-4 py-3">
                <p className="text-xs text-muted-foreground">Loading...</p>
              </CardContent>
            ) : !savedFilters || savedFilters.length === 0 ? (
              <CardContent className="px-4 py-6 text-center">
                <p className="text-xs text-muted-foreground">No saved filters.</p>
              </CardContent>
            ) : (
              <div className="divide-y divide-border">
                {savedFilters.map((filter) => (
                  <div
                    key={filter.id}
                    className="flex items-center justify-between px-4 py-2"
                  >
                    <button
                      onClick={() => handleLoadFilter(filter.query)}
                      className="truncate text-left text-sm text-primary hover:underline"
                      title={filter.query}
                    >
                      {filter.name}
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteFilter(filter.id)}
                      className="ml-2 h-6 w-6 flex-shrink-0 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Main Content */}
        <div className="flex-1">
          {/* Search form */}
          <form onSubmit={handleSearch} className="mb-6">
            <div className="flex gap-2">
              <Input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='e.g. priority = "high" AND label = "bug"'
                className="flex-1"
              />
              <Button type="submit" disabled={search.isPending || !query.trim()}>
                {search.isPending ? 'Searching...' : 'Search'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowSaveForm(!showSaveForm)}
                disabled={!query.trim()}
              >
                Save Filter
              </Button>
            </div>
          </form>

          {/* Save filter form */}
          {showSaveForm && (
            <Card className="mb-6 bg-muted/50">
              <CardContent className="pt-4">
                <form onSubmit={handleSaveFilter}>
                  <div className="flex items-end gap-3">
                    <div className="flex-1 space-y-1.5">
                      <Label htmlFor="filterName">Filter Name</Label>
                      <Input
                        id="filterName"
                        type="text"
                        value={filterName}
                        onChange={(e) => setFilterName(e.target.value)}
                        placeholder="e.g. My high priority bugs"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={createFilter.isPending || !filterName.trim()}
                    >
                      {createFilter.isPending ? 'Saving...' : 'Save'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowSaveForm(false);
                        setFilterName('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                  {createFilter.isError && (
                    <p className="mt-2 text-sm text-destructive">Failed to save filter.</p>
                  )}
                </form>
              </CardContent>
            </Card>
          )}

          {/* Error state */}
          {search.isError && (
            <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
              <p className="text-sm text-destructive">
                Search failed. Please check your query syntax and try again.
              </p>
            </div>
          )}

          {/* Results table */}
          {search.data && (
            <Card className="mb-6">
              <div className="border-b border-border px-6 py-3">
                <p className="text-sm text-muted-foreground">
                  {search.data.meta.total} result{search.data.meta.total !== 1 ? 's' : ''} found
                </p>
              </div>
              {search.data.data.length === 0 ? (
                <CardContent className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No issues match your query.
                  </p>
                </CardContent>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs uppercase tracking-wider">Key</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">Summary</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">Priority</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {search.data.data.map((issue) => (
                      <TableRow key={issue.key}>
                        <TableCell className="whitespace-nowrap text-sm font-medium text-primary">
                          {issue.key}
                        </TableCell>
                        <TableCell className="text-sm text-foreground">
                          {issue.summary}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <PriorityBadge priority={issue.priority} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {issue.status}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className="px-6 pb-4">
                <Pagination
                  page={search.data.meta.page}
                  perPage={search.data.meta.perPage}
                  total={search.data.meta.total}
                  totalPages={search.data.meta.totalPages}
                  onPageChange={handlePageChange}
                  onPerPageChange={handlePerPageChange}
                />
              </div>
            </Card>
          )}

          {/* WQL Help */}
          <Card>
            <CardContent className="p-6">
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                WQL Syntax Help
              </h3>
              <p className="mb-3 text-sm text-muted-foreground">
                Weaver Query Language (WQL) allows you to search issues using field
                comparisons and logical operators.
              </p>
              <div className="space-y-1">
                {WQL_EXAMPLES.map((example) => (
                  <button
                    key={example}
                    onClick={() => setQuery(example)}
                    className="block w-full rounded px-2 py-1 text-left font-mono text-xs text-muted-foreground hover:bg-primary/5 hover:text-primary"
                  >
                    {example}
                  </button>
                ))}
              </div>
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  <strong>Operators:</strong> =, !=, &gt;, &lt;, &gt;=, &lt;=, IN, NOT
                  IN
                </p>
                <p className="text-xs text-muted-foreground">
                  <strong>Logical:</strong> AND, OR
                </p>
                <p className="text-xs text-muted-foreground">
                  <strong>Fields:</strong> priority, status, label, assignee, reporter,
                  created, updated
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

const PRIORITY_VARIANTS: Record<string, string> = {
  highest: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-blue-100 text-blue-800 border-blue-200',
  lowest: 'bg-muted text-muted-foreground border-border',
};

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <Badge
      className={cn(
        'rounded-full px-2.5 py-0.5 text-xs font-medium',
        PRIORITY_VARIANTS[priority] || 'bg-muted text-muted-foreground border-border',
      )}
    >
      {priority}
    </Badge>
  );
}
