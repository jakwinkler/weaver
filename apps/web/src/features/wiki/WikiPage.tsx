import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { Page, PageTreeNode, PageVersion } from '@weaver/shared';
import { BookOpenText, FilePlus2, Search, X } from 'lucide-react';
import {
  useCreatePage,
  useDeletePage,
  useHasPermission,
  usePage,
  usePages,
  usePageSearch,
  usePageTree,
  useRestorePage,
  useUpdatePage,
} from '@/api';
import { extractPlainText } from '@/components/RichTextEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { PageEditor, type PageDraft } from './PageEditor';
import { PageTree } from './PageTree';
import { PageViewer } from './PageViewer';
import { VersionHistory } from './VersionHistory';

function flatten(nodes: PageTreeNode[]): PageTreeNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'ig'));
  return <>{parts.map((part, index) => part.toLowerCase() === query.toLowerCase()
    ? <mark key={index} className="bg-yellow-200 px-0 text-yellow-950">{part}</mark>
    : part)}</>;
}

export function WikiPage() {
  const { projectKey = '' } = useParams<{ projectKey: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSlug = searchParams.get('page');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(false);
  const [creatingParentId, setCreatingParentId] = useState<string | null | undefined>(undefined);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState('');
  const [editorSeed, setEditorSeed] = useState<PageDraft | undefined>();

  const {
    data: pages,
    isLoading: pagesLoading,
    isError: pagesError,
    refetch: refetchPages,
  } = usePages(projectKey);
  const {
    data: tree = [],
    isLoading: treeLoading,
    isError: treeError,
    refetch: refetchTree,
  } = usePageTree(projectKey);
  const {
    data: page,
    isLoading: pageLoading,
    isError: pageError,
    refetch: refetchPage,
  } = usePage(projectKey, selectedSlug);
  const {
    data: searchResults,
    isFetching: searchLoading,
    isError: searchError,
    refetch: refetchSearch,
  } = usePageSearch(projectKey, search);
  const createPage = useCreatePage(projectKey);
  const updatePage = useUpdatePage(projectKey);
  const deletePage = useDeletePage(projectKey);
  const restorePage = useRestorePage(projectKey);

  const canCreate = useHasPermission('pages.create');
  const canEdit = useHasPermission('pages.update');
  const canDelete = useHasPermission('pages.delete');

  useEffect(() => {
    if (!selectedSlug && creatingParentId === undefined && pages?.length) {
      setSearchParams({ page: pages[0].slug }, { replace: true });
    }
  }, [creatingParentId, pages, selectedSlug, setSearchParams]);

  const selectPage = (slug: string) => {
    setSearchParams({ page: slug });
    setEditing(false);
    setCreatingParentId(undefined);
    setHistoryOpen(false);
    setError('');
    setEditorSeed(undefined);
  };

  const breadcrumb = useMemo(() => {
    if (!page || !pages) return [];
    const byId = new Map(pages.map((item) => [item.id, item]));
    const trail: Page[] = [page];
    let parentId = page.parentId;
    while (parentId) {
      const parent = byId.get(parentId);
      if (!parent) break;
      trail.unshift(parent);
      parentId = parent.parentId;
    }
    return trail.map(({ id, title, slug }) => ({ id, title, slug }));
  }, [page, pages]);

  const startCreate = (parentId: string | null) => {
    setCreatingParentId(parentId);
    setEditing(false);
    setHistoryOpen(false);
    setError('');
    setEditorSeed(undefined);
  };

  const saveDraft = async (draft: { title: string; body: Record<string, unknown> }) => {
    if (creatingParentId !== undefined) {
      return createPage.mutateAsync({ ...draft, parentId: creatingParentId });
    }
    if (!page) throw new Error('No page selected');
    return updatePage.mutateAsync({ slug: page.slug, ...draft });
  };

  const afterSave = (saved: Page, pendingDraft?: PageDraft) => {
    setSearchParams({ page: saved.slug }, { replace: true });
    if (creatingParentId !== undefined) {
      setEditorSeed(pendingDraft);
      setCreatingParentId(undefined);
      setEditing(true);
    } else {
      setEditorSeed(undefined);
    }
  };

  const movePage = async (
    slug: string,
    update: { parentId: string | null; sortOrder: number },
  ) => {
    setError('');
    try {
      await updatePage.mutateAsync({ slug, ...update });
    } catch {
      setError('That page could not be moved. Check the destination and try again.');
    }
  };

  const removePage = async () => {
    if (!page) return;
    const confirmed = window.confirm(
      `Delete “${page.title}”? Its child pages will move up one level.`,
    );
    if (!confirmed) return;
    try {
      await deletePage.mutateAsync(page.slug);
      const next = pages?.find((item) => item.id !== page.id);
      if (next) selectPage(next.slug);
      else {
        setSearchParams({}, { replace: true });
        setHistoryOpen(false);
      }
    } catch {
      setError('This page could not be deleted. Try again in a moment.');
    }
  };

  const restoreVersion = async (version: PageVersion) => {
    if (!page) return;
    try {
      const restored = await restorePage.mutateAsync({
        slug: page.slug,
        versionId: version.id,
      });
      setSearchParams({ page: restored.slug }, { replace: true });
    } catch (restoreError) {
      setError('This version could not be restored. Your current page was not changed.');
      throw restoreError;
    }
  };

  const parentTitle = creatingParentId
    ? flatten(tree).find((item) => item.id === creatingParentId)?.title
    : undefined;

  return (
    <div className="min-h-[calc(100vh-7.5rem)]">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground" aria-label="Project breadcrumb">
          <Link to={`/projects/${projectKey}`} className="font-medium hover:text-foreground hover:underline">
            {projectKey}
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-foreground">Wiki</span>
        </nav>
        <p className="text-xs text-muted-foreground">Project knowledge, kept next to the work.</p>
      </header>

      {error && (
        <div role="alert" className="mb-3 flex items-center justify-between bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss error"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className={cn(
        'grid overflow-hidden border border-border bg-card lg:h-[calc(100vh-10.5rem)]',
        historyOpen
          ? 'lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_20rem]'
          : 'lg:grid-cols-[17rem_minmax(0,1fr)]',
      )}>
        <aside className="flex max-h-80 min-h-0 flex-col border-b border-border bg-muted/30 lg:max-h-none lg:border-b-0 lg:border-r">
          <div className="border-b border-border p-3">
            <label htmlFor="wiki-search" className="sr-only">Search wiki pages</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="wiki-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search this wiki"
                className="pl-8 pr-8 shadow-none"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear wiki search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {search.trim() ? (
            <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
              <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {searchLoading ? 'Searching' : `${searchResults?.length ?? 0} result${searchResults?.length === 1 ? '' : 's'}`}
              </div>
              {searchResults?.map((result) => (
                <button
                  key={result.id}
                  onClick={() => { selectPage(result.slug); setSearch(''); }}
                  className="block w-full border-b border-border px-4 py-3 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="block text-sm font-medium text-foreground">
                    <Highlight text={result.title} query={search.trim()} />
                  </span>
                  <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                    <Highlight text={extractPlainText(result.body) || 'Empty page'} query={search.trim()} />
                  </span>
                </button>
              ))}
              {searchError && (
                <div className="px-4 py-6 text-center text-sm">
                  <p className="text-destructive">Search could not be completed.</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetchSearch()}>
                    Try again
                  </Button>
                </div>
              )}
              {!searchLoading && searchResults?.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No pages match “{search.trim()}”.
                </p>
              )}
            </div>
          ) : treeLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading pages...</p>
          ) : treeError || pagesError ? (
            <div className="p-4 text-sm">
              <p className="text-destructive">The page tree could not be loaded.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => { void refetchPages(); void refetchTree(); }}
              >
                Try again
              </Button>
            </div>
          ) : (
            <PageTree
              nodes={tree}
              selectedSlug={selectedSlug}
              canCreate={canCreate}
              canMove={canEdit}
              moving={updatePage.isPending}
              onSelect={selectPage}
              onCreate={startCreate}
              onMove={movePage}
            />
          )}
        </aside>

        <main className="min-w-0 overflow-y-auto bg-background">
          {creatingParentId !== undefined ? (
            <PageEditor
              parentTitle={parentTitle}
              onSave={saveDraft}
              onSaved={afterSave}
              onCancel={() => setCreatingParentId(undefined)}
            />
          ) : editing && page ? (
            <PageEditor
              key={page.id}
              page={page}
              initialDraft={editorSeed}
              onSave={saveDraft}
              onSaved={afterSave}
              onCancel={() => setEditing(false)}
            />
          ) : pageLoading || pagesLoading ? (
            <div className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">Loading page...</div>
          ) : pageError ? (
            <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center text-sm">
              <p className="text-destructive">This page could not be loaded.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetchPage()}>
                Try again
              </Button>
            </div>
          ) : page ? (
            <PageViewer
              page={page}
              breadcrumb={breadcrumb}
              canEdit={canEdit}
              canDelete={canDelete}
              onNavigate={selectPage}
              onEdit={() => setEditing(true)}
              onHistory={() => setHistoryOpen(true)}
              onDelete={() => void removePage()}
            />
          ) : (
            <div className="flex min-h-[28rem] flex-col items-center justify-center px-6 text-center">
              <BookOpenText className="mb-5 h-12 w-12 text-muted-foreground" />
              <h1 className="text-2xl font-bold tracking-[-0.02em]">Build the project handbook</h1>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Capture decisions, runbooks, and team context in a page tree everyone can search.
              </p>
              {canCreate && (
                <Button className="mt-6" onClick={() => startCreate(null)}>
                  <FilePlus2 />
                  Create the first page
                </Button>
              )}
            </div>
          )}
        </main>

        {historyOpen && page && (
          <VersionHistory
            projectKey={projectKey}
            page={page}
            canRestore={canEdit}
            onClose={() => setHistoryOpen(false)}
            onRestore={restoreVersion}
          />
        )}
      </div>
    </div>
  );
}
