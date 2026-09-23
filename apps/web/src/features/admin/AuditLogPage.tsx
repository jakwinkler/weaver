import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, FileClock, Search } from 'lucide-react';
import { downloadAuditLog, useAuditLog, useUsers, type AuditLogFilters } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination, getStoredPerPage } from '@/components/Pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const RESOURCES = [
  'project',
  'issue',
  'role',
  'user',
  'plugin',
  'workflow',
  'webhook',
  'settings',
  'automation',
];

const ACTIONS = [
  'project.created',
  'project.updated',
  'project.deleted',
  'project.member_added',
  'project.member_role_changed',
  'project.member_removed',
  'project.issue_types_updated',
  'role.created',
  'role.updated',
  'role.deleted',
  'role.defaults_seeded',
  'user.role_changed',
  'plugin.installed',
  'plugin.uninstalled',
  'plugin.enabled',
  'plugin.disabled',
  'plugin.settings_updated',
  'plugin.enabled_for_project',
  'plugin.disabled_for_project',
  'workflow.created',
  'workflow.updated',
  'workflow.deleted',
  'workflow.status_created',
  'workflow.status_updated',
  'workflow.status_deleted',
  'workflow.transition_created',
  'workflow.transition_updated',
  'workflow.transition_deleted',
  'webhook.created',
  'webhook.updated',
  'webhook.deleted',
  'webhook.tested',
  'settings.updated',
  'settings.smtp_tested',
];

const selectClassName =
  'h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring';

export function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(getStoredPerPage);
  const [userId, setUserId] = useState('');
  const [resource, setResource] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const filters = useMemo<AuditLogFilters>(
    () => ({
      page,
      perPage,
      userId: userId || undefined,
      resource: resource || undefined,
      action: action || undefined,
      from: from ? `${from}T00:00:00.000Z` : undefined,
      to: to ? `${to}T23:59:59.999Z` : undefined,
      search: search.trim() || undefined,
    }),
    [page, perPage, userId, resource, action, from, to, search],
  );

  const { data, isLoading, isError, refetch } = useAuditLog(filters);
  const { data: users } = useUsers();

  const updateFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

  const clearFilters = () => {
    setUserId('');
    setResource('');
    setAction('');
    setFrom('');
    setTo('');
    setSearch('');
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadAuditLog(filters);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-w-0">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Audit Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review security-sensitive changes across this organization.
          </p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={exporting}>
          <Download className="h-4 w-4" />
          {exporting ? 'Exporting…' : 'Export CSV'}
        </Button>
      </div>

      <div className="mb-5 rounded-lg border border-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="relative block xl:col-span-2">
            <span className="sr-only">Search audit log</span>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => updateFilter(setSearch, event.target.value)}
              placeholder="Search actions, resources, or details"
              className="pl-9"
            />
          </label>

          <label>
            <span className="sr-only">User</span>
            <select
              value={userId}
              onChange={(event) => updateFilter(setUserId, event.target.value)}
              className={`${selectClassName} w-full`}
            >
              <option value="">All users</option>
              {users?.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName || user.email}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="sr-only">Resource type</span>
            <select
              value={resource}
              onChange={(event) => updateFilter(setResource, event.target.value)}
              className={`${selectClassName} w-full`}
            >
              <option value="">All resources</option>
              {RESOURCES.map((value) => (
                <option key={value} value={value}>
                  {titleCase(value)}
                </option>
              ))}
            </select>
          </label>

          <label className="xl:col-span-2">
            <span className="sr-only">Action</span>
            <select
              value={action}
              onChange={(event) => updateFilter(setAction, event.target.value)}
              className={`${selectClassName} w-full`}
            >
              <option value="">All actions</option>
              {ACTIONS.map((value) => (
                <option key={value} value={value}>
                  {actionLabel(value)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
              From
            </span>
            <Input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => updateFilter(setFrom, event.target.value)}
            />
          </label>

          <label className="flex items-center gap-2">
            <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">To</span>
            <Input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => updateFilter(setTo, event.target.value)}
            />
          </label>
        </div>

        {(userId || resource || action || from || to || search) && (
          <Button variant="ghost" size="sm" className="mt-3" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading audit log…</div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 py-12 text-center">
          <p className="text-sm text-destructive">The audit log could not be loaded.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : !data?.data.length ? (
        <div className="rounded-lg border border-border bg-card py-12 text-center">
          <FileClock className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium text-foreground">No audit entries found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Security-sensitive changes will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-muted/50">
                  <TableHead className="w-10">
                    <span className="sr-only">Details</span>
                  </TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((entry) => {
                  const isExpanded = expanded === entry.id;
                  return (
                    <Fragment key={entry.id}>
                      <TableRow>
                        <TableCell className="pr-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label={`${isExpanded ? 'Hide' : 'Show'} details for ${entry.action}`}
                            aria-expanded={isExpanded}
                            onClick={() => setExpanded(isExpanded ? null : entry.id)}
                          >
                            {isExpanded ? <ChevronDown /> : <ChevronRight />}
                          </Button>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium text-foreground">
                            {entry.user?.displayName || 'Unknown user'}
                          </div>
                          <div className="text-xs text-muted-foreground">{entry.user?.email}</div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm font-medium">
                          {actionLabel(entry.action)}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm capitalize">{entry.resource}</div>
                          <div
                            className="max-w-48 truncate font-mono text-xs text-muted-foreground"
                            title={entry.resourceId}
                          >
                            {entry.resourceId}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-56 text-xs text-muted-foreground">
                          <div>{entry.ipAddress || 'Unknown IP'}</div>
                          <div className="truncate" title={entry.userAgent || undefined}>
                            {entry.userAgent || 'Unknown client'}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={6} className="px-6 py-4">
                            <div className="grid gap-4 lg:grid-cols-2">
                              <AuditState label="Before" value={entry.metadata.before} />
                              <AuditState label="After" value={entry.metadata.after} />
                            </div>
                            {entry.metadata.context !== undefined && (
                              <AuditState
                                label="Request context"
                                value={entry.metadata.context}
                                className="mt-4"
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <Pagination
            page={data.meta.page}
            perPage={data.meta.perPage}
            total={data.meta.total}
            totalPages={data.meta.totalPages}
            onPageChange={setPage}
            onPerPageChange={(value) => {
              setPerPage(value);
              setPage(1);
            }}
          />
        </>
      )}
    </div>
  );
}

function AuditState({
  label,
  value,
  className = '',
}: {
  label: string;
  value: unknown;
  className?: string;
}) {
  return (
    <div className={className}>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h3>
      <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs text-foreground">
        {value === undefined ? 'Not captured' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function actionLabel(action: string) {
  const [resource, event] = action.split('.', 2);
  return `${titleCase(resource)} ${titleCase(event ?? '')}`.trim();
}

function titleCase(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
