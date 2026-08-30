import { useState, useCallback } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import {
  useProject,
  useProjectIssues,
  useUpdateProject,
  useHasPermission,
  useProjectPlugins,
  useAvailablePlugins,
  useInstalledPlugins,
} from '@/api';
import { getProjectViewEntries } from '@/plugins/plugin-slot-registry';
import { Settings as SettingsIcon, Pencil, X, Check } from 'lucide-react';
import {
  RichTextEditor,
  RichTextRenderer,
  normalizeCommentBody,
  serializeDoc,
} from '@/components/RichTextEditor';
import { isRichTextEmpty } from '@/lib/richText';
import { ProjectIcon } from './ProjectSettingsPage';
import { IssueTypeIcon } from '@/components/IconPicker';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

export function ProjectDetailPage() {
  const { projectKey } = useParams<{ projectKey: string }>();
  const { data: project, isLoading: projectLoading } = useProject(projectKey!);
  const { data: issuesData, isLoading: issuesLoading } = useProjectIssues({
    projectKey: projectKey!,
  });
  const updateProject = useUpdateProject();
  const location = useLocation();
  const canEdit = useHasPermission('projects.update');

  const [editingDesc, setEditingDesc] = useState(false);
  const [descJson, setDescJson] = useState<Record<string, unknown> | null>(null);

  const startEditing = useCallback(() => {
    setDescJson(normalizeCommentBody(project?.description || ''));
    setEditingDesc(true);
  }, [project?.description]);

  const cancelEditing = useCallback(() => {
    setEditingDesc(false);
    setDescJson(null);
  }, []);

  const saveDescription = useCallback(async () => {
    if (!project) return;
    const descStr = serializeDoc(descJson);
    await updateProject.mutateAsync({
      key: project.key,
      description: descStr,
    });
    setEditingDesc(false);
    setDescJson(null);
  }, [descJson, project, updateProject]);

  if (projectLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading project...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Project not found.</p>
      </div>
    );
  }

  const normalizedDescription = normalizeCommentBody(project.description);
  const hasDescription = !isRichTextEmpty(normalizedDescription);

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ProjectIcon
              iconAttachmentId={project.iconAttachmentId}
              projectKey={project.key}
              size="md"
            />
            <Badge
              variant="outline"
              className="bg-primary/10 text-primary border-transparent font-semibold"
            >
              {project.key}
            </Badge>
            <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
          </div>
          {canEdit && (
            <Button variant="secondary" size="sm" asChild>
              <Link to={`/projects/${project.key}/settings`}>
                <SettingsIcon className="h-4 w-4" />
                Settings
              </Link>
            </Button>
          )}
        </div>

        {/* Description */}
        <div className="mt-3">
          {editingDesc ? (
            <div className="space-y-2">
              <RichTextEditor
                content={descJson}
                onChange={setDescJson}
                placeholder="Add a project description..."
              />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={saveDescription} disabled={updateProject.isPending}>
                  <Check className="h-3.5 w-3.5" />
                  {updateProject.isPending ? 'Saving...' : 'Save'}
                </Button>
                <Button size="sm" variant="secondary" onClick={cancelEditing}>
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="group relative">
              {hasDescription ? (
                <div className="rounded-md">
                  <RichTextRenderer content={normalizedDescription} />
                </div>
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  {canEdit ? 'Click the edit icon to add a description.' : 'No description.'}
                </p>
              )}
              {canEdit && (
                <button
                  onClick={startEditing}
                  className="absolute top-0 right-0 rounded-md bg-card p-1.5 text-muted-foreground opacity-0 shadow-sm ring-1 ring-border transition-opacity hover:text-primary group-hover:opacity-100"
                  title="Edit description"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* View navigation */}
      <ProjectViewNav projectKey={project.key} currentPath={location.pathname} />

      <div className="mb-6 grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Issues</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{project.issueCounter}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Created</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {new Date(project.createdAt).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Last Updated</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {new Date(project.updatedAt).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Recent Issues</h2>
        <Link
          to={`/projects/${project.key}/issues`}
          className="text-sm font-medium text-primary hover:text-primary/80"
        >
          View all issues
        </Link>
      </div>

      {issuesLoading ? (
        <p className="mt-4 text-muted-foreground">Loading issues...</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="uppercase tracking-wider text-xs">Type</TableHead>
                <TableHead className="uppercase tracking-wider text-xs">Key</TableHead>
                <TableHead className="uppercase tracking-wider text-xs">Summary</TableHead>
                <TableHead className="uppercase tracking-wider text-xs">Priority</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issuesData?.data.slice(0, 10).map((issue) => (
                <TableRow key={issue.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {issue.issueType ? (
                      <span
                        className="inline-flex items-center gap-1.5"
                        title={issue.issueType.name}
                      >
                        <IssueTypeIcon
                          icon={issue.issueType.icon}
                          iconColor={issue.issueType.iconColor}
                          iconAttachmentId={issue.issueType.iconAttachmentId}
                        />
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium text-primary">
                    <Link to={`/issues/${issue.key}`}>{issue.key}</Link>
                  </TableCell>
                  <TableCell className="text-foreground">
                    <Link to={`/issues/${issue.key}`}>{issue.summary}</Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <PriorityBadge priority={issue.priority} />
                  </TableCell>
                </TableRow>
              ))}
              {issuesData?.data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No issues yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function ProjectViewNav({ projectKey, currentPath }: { projectKey: string; currentPath: string }) {
  const { data: plugins } = useProjectPlugins(projectKey);
  const { data: availablePlugins } = useAvailablePlugins();
  const { data: installedPlugins } = useInstalledPlugins();

  // Only show plugins that are both installed+enabled at tenant level AND enabled for this project
  const tenantEnabledIds = new Set(
    (installedPlugins || []).filter((p) => p.enabled).map((p) => p.pluginId),
  );
  const enabledPluginIds = (plugins?.map((p) => p.pluginId) || []).filter((id) =>
    tenantEnabledIds.has(id),
  );
  const dynamicViews = getProjectViewEntries(availablePlugins ?? [], enabledPluginIds);

  const viewLinks = [
    { label: 'Issues', path: 'issues' },
    { label: 'Roadmap', path: 'roadmap' },
    { label: 'Wiki', path: 'wiki' },
    ...dynamicViews.map((v) => ({ label: v.label, path: v.viewPath })),
  ];

  return (
    <nav className="mb-6 flex gap-1 rounded-lg border border-border bg-card p-1">
      {viewLinks.map(({ label, path }) => {
        const href = `/projects/${projectKey}/${path}`;
        const isActive = currentPath === href;
        return (
          <Link
            key={path}
            to={href}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    highest: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-blue-100 text-blue-700',
    lowest: 'bg-gray-100 text-gray-700',
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-full border-transparent font-medium',
        colors[priority] ?? 'bg-gray-100 text-gray-700',
      )}
    >
      {priority}
    </Badge>
  );
}
