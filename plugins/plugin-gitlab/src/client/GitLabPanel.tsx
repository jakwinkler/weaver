import { useEffect, useRef, useState } from 'react';
import { GitCommitHorizontal, GitMerge, GitPullRequest, type LucideIcon } from 'lucide-react';

interface PluginApi {
  get<T = unknown>(path: string, params?: Record<string, string>): Promise<T>;
}

interface GitLabPanelProps {
  pluginContext: { api: PluginApi };
  issueKey: string;
}

interface GitLabLink {
  id: string;
  link_type: string;
  url: string;
  title: string;
  author: string;
  status: string | null;
}

const LINK_TYPES: Record<string, { label: string; icon: LucideIcon }> = {
  commit: { label: 'Commit', icon: GitCommitHorizontal },
  merge_request: { label: 'Merge request', icon: GitPullRequest },
  mr_merged: { label: 'Merged', icon: GitMerge },
};

// The URL comes from a webhook payload, so only link it when it is plain http(s).
function safeHref(url: string): string | undefined {
  return /^https?:\/\//i.test(url) ? url : undefined;
}

export function GitLabPanel({ pluginContext, issueKey }: GitLabPanelProps) {
  const [loaded, setLoaded] = useState<{ issueKey: string; links: GitLabLink[] } | null>(null);
  // PluginSlot builds a new context on every render; read the api through a ref so a
  // re-render of the issue page does not refetch.
  const apiRef = useRef(pluginContext.api);
  useEffect(() => {
    apiRef.current = pluginContext.api;
  });

  useEffect(() => {
    let cancelled = false;
    apiRef.current
      .get<GitLabLink[]>(`/links/${issueKey}`)
      .then((data) => {
        if (!cancelled) setLoaded({ issueKey, links: Array.isArray(data) ? data : [] });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ issueKey, links: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [issueKey]);

  const links = loaded?.issueKey === issueKey ? loaded.links : [];
  if (links.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card text-card-foreground shadow">
      <h3 className="px-4 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        GitLab
      </h3>
      <ul className="space-y-3 px-4 pb-4">
        {links.map((link) => {
          const type = LINK_TYPES[link.link_type] ?? { label: link.link_type, icon: GitCommitHorizontal };
          const Icon = type.icon;
          const href = safeHref(link.url);
          const meta = [type.label, link.link_type === 'merge_request' ? link.status?.toLowerCase() : null, link.author]
            .filter(Boolean)
            .join(' · ');
          return (
            <li key={link.id} className="flex items-start gap-2">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={link.title}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {link.title}
                  </a>
                ) : (
                  <span title={link.title} className="block truncate text-sm font-medium">
                    {link.title}
                  </span>
                )}
                <p className="truncate text-xs text-muted-foreground">{meta}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
