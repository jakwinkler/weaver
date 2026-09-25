import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  usePublicProject,
  usePublicProjectIssues,
  usePublicProjectBoard,
} from '@/api/hooks-public';
import type { PublicBoardData } from '@/api/hooks-public';
import { Pagination } from '@/components/Pagination';
import type { PublicIssue, PublicWorkflowStatus } from '@weaver/shared';
import { extractPlainText } from '@/lib/richText';

type Tab = 'issues' | 'board';

export function PublicProjectPage() {
  const { tenantSlug = '', projectKey = '' } = useParams<{
    tenantSlug: string;
    projectKey: string;
  }>();
  const [tab, setTab] = useState<Tab>('issues');
  const { data: project, isLoading, error } = usePublicProject(tenantSlug, projectKey);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/50">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted/50">
        <h1 className="text-2xl font-bold text-foreground">Project not found</h1>
        <p className="mt-2 text-muted-foreground">This project does not exist or is not public.</p>
        <Link to="/login" className="mt-4 text-sm text-primary hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  const descriptionText = extractPlainText(project.description);

  return (
    <div className="min-h-screen bg-muted/50">
      {/* Header */}
      <header className="flex h-14 items-center justify-between bg-slate-900 px-6 text-white">
        <span className="text-xl font-bold">Weaver</span>
        <Link to="/login" className="text-sm text-white/80 hover:text-white">
          Sign in
        </Link>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* Project header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
          <p className="text-sm text-muted-foreground">{project.key}</p>
          {descriptionText && (
            <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
              {descriptionText}
            </p>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-4 border-b border-border">
          {(['issues', 'board'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`border-b-2 px-3 py-2 text-sm font-medium capitalize ${
                tab === t
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'issues' && (
          <PublicIssueList
            key={`${tenantSlug}:${projectKey}`}
            tenantSlug={tenantSlug}
            projectKey={projectKey}
          />
        )}
        {tab === 'board' && (
          <PublicBoard
            key={`${tenantSlug}:${projectKey}`}
            tenantSlug={tenantSlug}
            projectKey={projectKey}
          />
        )}
      </div>
    </div>
  );
}

function PublicIssueList({ tenantSlug, projectKey }: { tenantSlug: string; projectKey: string }) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const { data, isLoading, error } = usePublicProjectIssues(tenantSlug, projectKey, page, perPage);
  if (error) return <p role="alert">Issues could not be loaded. Please try again.</p>;

  if (isLoading) return <p className="py-4 text-muted-foreground">Loading issues...</p>;

  const issues = data?.data || [];

  if (issues.length === 0 && !data?.meta.total) {
    return <p className="py-8 text-center text-muted-foreground">No issues yet.</p>;
  }

  return (
    <div>
      <div className="divide-y divide-border border border-border bg-card">
        {issues.map((issue: PublicIssue) => (
          <div key={issue.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <span className="mr-2 text-xs font-medium text-muted-foreground">{issue.key}</span>
              <span className="text-sm text-foreground">{issue.summary}</span>
            </div>
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground capitalize">
              {issue.priority}
            </span>
          </div>
        ))}
      </div>
      {data && (
        <Pagination
          {...data.meta}
          onPageChange={setPage}
          onPerPageChange={(value) => {
            setPerPage(value);
            setPage(1);
          }}
        />
      )}
    </div>
  );
}

function PublicBoard({ tenantSlug, projectKey }: { tenantSlug: string; projectKey: string }) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const { data, isLoading, error } = usePublicProjectBoard(tenantSlug, projectKey, page, perPage);
  if (error) return <p role="alert">Board could not be loaded. Please try again.</p>;

  if (isLoading) return <p className="py-4 text-muted-foreground">Loading board...</p>;

  const board = data as PublicBoardData | undefined;
  if (!board || board.statuses.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">No workflow configured.</p>;
  }

  const issuesByStatus = new Map<string, PublicIssue[]>();
  for (const status of board.statuses) {
    issuesByStatus.set(status.id, []);
  }
  for (const issue of board.issues) {
    const list = issuesByStatus.get(issue.statusId);
    if (list) list.push(issue);
  }

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">Column counts show issues on this page.</p>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {board.statuses.map((status: PublicWorkflowStatus) => (
          <div key={status.id} className="w-64 shrink-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: status.color }} />
              <span className="text-sm font-medium text-foreground">{status.name}</span>
              <span className="text-xs text-muted-foreground">
                {issuesByStatus.get(status.id)?.length || 0}
              </span>
            </div>
            <div className="space-y-2">
              {(issuesByStatus.get(status.id) || []).map((issue: PublicIssue) => (
                <div key={issue.id} className="border border-border bg-card p-3">
                  <p className="text-xs text-muted-foreground">{issue.key}</p>
                  <p className="mt-0.5 text-sm text-foreground">{issue.summary}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Pagination
        {...board.meta}
        onPageChange={setPage}
        onPerPageChange={(value) => {
          setPerPage(value);
          setPage(1);
        }}
      />
    </div>
  );
}
