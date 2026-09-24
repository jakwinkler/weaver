import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

interface ScmLink {
  id: string;
  issue_key: string;
  link_type: string;
  url: string;
  title: string;
  author: string;
  status?: string;
  created_at: string;
}

interface ScmLinksPanelProps {
  issueKey: string;
}

const LINK_TYPE_ICONS: Record<string, string> = {
  commit: 'C',
  pull_request: 'PR',
  pr_merged: 'M',
  merge_request: 'MR',
  mr_merged: 'M',
  branch: 'B',
};

const LINK_TYPE_STYLES: Record<string, string> = {
  commit: 'bg-gray-100 text-gray-700',
  pull_request: 'bg-blue-100 text-blue-700',
  pr_merged: 'bg-purple-100 text-purple-700',
  merge_request: 'bg-blue-100 text-blue-700',
  mr_merged: 'bg-purple-100 text-purple-700',
  branch: 'bg-green-100 text-green-700',
};

function useScmLinks(issueKey: string, provider: string) {
  return useQuery({
    queryKey: ['scmLinks', issueKey, provider],
    queryFn: async () => {
      try {
        const res = await apiClient.get<ScmLink[]>(
          `/plugins/@weaver/plugin-${provider}/${provider === 'github' ? 'links' : 'links'}/${issueKey}`,
        );
        return res.data;
      } catch {
        return [];
      }
    },
    enabled: !!issueKey,
    retry: false,
  });
}

export function ScmLinksPanel({ issueKey }: ScmLinksPanelProps) {
  const { data: githubLinks } = useScmLinks(issueKey, 'github');
  const { data: gitlabLinks } = useScmLinks(issueKey, 'gitlab');
  const { data: bitbucketLinks } = useScmLinks(issueKey, 'bitbucket');

  const allLinks = [
    ...(githubLinks || []).map((l) => ({ ...l, provider: 'GitHub' })),
    ...(gitlabLinks || []).map((l) => ({ ...l, provider: 'GitLab' })),
    ...(bitbucketLinks || []).map((l) => ({ ...l, provider: 'Bitbucket' })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (allLinks.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        Development
      </h2>
      <div className="space-y-2">
        {allLinks.map((link) => (
          <div
            key={link.id}
            className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
          >
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded text-xs font-bold ${
                LINK_TYPE_STYLES[link.link_type] || 'bg-gray-100 text-gray-700'
              }`}
            >
              {LINK_TYPE_ICONS[link.link_type] || '?'}
            </span>
            <div className="min-w-0 flex-1">
              <a
                href={safeScmUrl(link.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-sm font-medium text-indigo-600 hover:text-indigo-800"
              >
                {link.title || link.url}
              </a>
              <p className="text-xs text-gray-400">
                {link.provider} &middot; {link.author} &middot;{' '}
                {new Date(link.created_at).toLocaleDateString()}
              </p>
            </div>
            {link.status && (
              <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                {link.status}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function safeScmUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}
