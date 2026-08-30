import type { Page } from '@weaver/shared';
import { Clock3, Pencil, Trash2 } from 'lucide-react';
import { RichTextRenderer } from '@/components/RichTextRenderer';
import { Button } from '@/components/ui/button';

interface BreadcrumbItem {
  id: string;
  title: string;
  slug: string;
}

interface PageViewerProps {
  page: Page;
  breadcrumb: BreadcrumbItem[];
  canEdit: boolean;
  canDelete: boolean;
  onNavigate: (slug: string) => void;
  onEdit: () => void;
  onHistory: () => void;
  onDelete: () => void;
}

export function PageViewer({
  page,
  breadcrumb,
  canEdit,
  canDelete,
  onNavigate,
  onEdit,
  onHistory,
  onDelete,
}: PageViewerProps) {
  return (
    <article className="mx-auto w-full max-w-5xl px-5 py-7 sm:px-8 lg:py-10">
      <div className="mb-7 border-b border-border pb-6">
        <nav aria-label="Page breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          {breadcrumb.map((item, index) => (
            <span key={item.id} className="flex items-center gap-1.5">
              {index > 0 && <span aria-hidden="true">/</span>}
              {item.id === page.id ? (
                <span className="text-foreground">{item.title}</span>
              ) : (
                <button className="hover:text-foreground hover:underline" onClick={() => onNavigate(item.slug)}>
                  {item.title}
                </button>
              )}
            </span>
          ))}
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-[-0.025em] text-foreground sm:text-4xl">
              {page.title}
            </h1>
            <p className="mt-2 text-xs text-muted-foreground">
              Updated {new Date(page.updatedAt).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onHistory}>
              <Clock3 />
              History
            </Button>
            {canEdit && (
              <Button size="sm" onClick={onEdit}>
                <Pencil />
                Edit
              </Button>
            )}
            {canDelete && (
              <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Delete page">
                <Trash2 className="text-destructive" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[72ch] text-base leading-7">
        <RichTextRenderer content={page.body} className="text-base leading-7" />
      </div>
    </article>
  );
}
