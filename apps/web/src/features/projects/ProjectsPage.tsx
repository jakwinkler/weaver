import { useState, useCallback, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useProjects, useCreateProject, useHasPermission } from '@/api';
import { RichTextEditor, serializeDoc } from '@/components/RichTextEditor';
import { extractPlainText } from '@/lib/richText';
import { ProjectIcon } from './ProjectSettingsPage';
import { Pagination, getStoredPerPage } from '@/components/Pagination';
import { SortableHeader, type SortDirection } from '@/components/SortableHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

function parseSortParam(sort: string | null): { field: string | null; direction: SortDirection } {
  if (!sort) return { field: null, direction: null };
  const desc = sort.startsWith('-');
  return { field: desc ? sort.slice(1) : sort, direction: desc ? 'desc' : 'asc' };
}

function buildSortParam(field: string | null, direction: SortDirection): string | undefined {
  if (!field || !direction) return undefined;
  return direction === 'desc' ? `-${field}` : field;
}

export function ProjectsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page')) || 1;
  const perPage = Number(searchParams.get('perPage')) || getStoredPerPage();
  const sortParam = searchParams.get('sort');
  const { field: sortField, direction: sortDirection } = parseSortParam(sortParam);

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(updates)) {
          if (v === undefined || v === '') {
            next.delete(k);
          } else {
            next.set(k, v);
          }
        }
        return next;
      });
    },
    [setSearchParams],
  );

  const { data, isLoading } = useProjects({
    page,
    perPage,
    sort: buildSortParam(sortField, sortDirection),
  });
  const createProject = useCreateProject();
  const canCreate = useHasPermission('projects.create');

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [descJson, setDescJson] = useState<Record<string, unknown> | null>(null);

  const handleDescChange = useCallback((json: Record<string, unknown>) => {
    setDescJson(json);
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const descStr = serializeDoc(descJson);
    await createProject.mutateAsync({
      name,
      key,
      description: descStr || undefined,
    });
    setName('');
    setKey('');
    setDescJson(null);
    setShowForm(false);
  };

  const handlePageChange = (newPage: number) => {
    updateParams({ page: newPage === 1 ? undefined : String(newPage) });
  };

  const handlePerPageChange = (newPerPage: number) => {
    updateParams({ perPage: String(newPerPage), page: undefined });
  };

  const handleSort = (field: string, direction: SortDirection) => {
    const sort = buildSortParam(field, direction);
    updateParams({ sort, page: undefined });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading projects...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Projects</h1>
        {canCreate && (
          <Button onClick={() => setShowForm(!showForm)} variant={showForm ? 'outline' : 'default'}>
            {showForm ? 'Cancel' : 'Create Project'}
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardContent className="pt-5">
            <form onSubmit={handleCreate}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="projectName">Name</Label>
                  <Input
                    id="projectName"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Project"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="projectKey">Key</Label>
                  <Input
                    id="projectKey"
                    type="text"
                    required
                    value={key}
                    onChange={(e) => setKey(e.target.value.toUpperCase())}
                    placeholder="PROJ"
                  />
                </div>
              </div>
              <div className="mt-4 space-y-1">
                <Label>Description</Label>
                <RichTextEditor
                  content={descJson}
                  onChange={handleDescChange}
                  placeholder="Optional description"
                />
              </div>
              {createProject.isError && (
                <p className="mt-2 text-sm text-destructive">Failed to create project.</p>
              )}
              <div className="mt-4">
                <Button type="submit" disabled={createProject.isPending}>
                  {createProject.isPending ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className={cn('overflow-hidden rounded-lg border border-border bg-card')}>
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <SortableHeader
                label="Project"
                field="name"
                currentSort={sortField}
                currentDirection={sortDirection}
                onSort={handleSort}
              />
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Description
              </TableHead>
              <SortableHeader
                label="Key"
                field="key"
                currentSort={sortField}
                currentDirection={sortDirection}
                onSort={handleSort}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.data.map((project) => (
              <TableRow key={project.id} className="hover:bg-muted/50">
                <TableCell className="whitespace-nowrap">
                  <Link to={`/projects/${project.key}`} className="flex items-center gap-3">
                    <ProjectIcon
                      iconAttachmentId={project.iconAttachmentId}
                      projectKey={project.key}
                      size="sm"
                    />
                    <div>
                      <span className="text-sm font-medium text-primary">{project.key}</span>
                      <span className="ml-2 text-sm text-foreground">{project.name}</span>
                    </div>
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <span className="line-clamp-2">
                    {extractPlainText(project.description) || '-'}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {project.key}
                </TableCell>
              </TableRow>
            ))}
            {data?.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                  No projects yet. Create your first project to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {data && (
        <Pagination
          page={data.meta.page}
          perPage={data.meta.perPage}
          total={data.meta.total}
          totalPages={data.meta.totalPages}
          onPageChange={handlePageChange}
          onPerPageChange={handlePerPageChange}
        />
      )}
    </div>
  );
}
