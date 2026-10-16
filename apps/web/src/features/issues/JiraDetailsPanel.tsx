import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { RichTextRenderer } from './RichTextEditor';

type Details = {
  originalKey: string;
  sourceUrl: string;
  creator: string;
  resolution: string | null;
  originalEstimateSeconds: number | null;
  remainingEstimateSeconds: number | null;
  fixVersions: Array<{ id: string; name: string }>;
  affectedVersions: Array<{ id: string; name: string }>;
  components: Array<{ id: string; name: string }>;
  worklogs: Array<{
    id: string;
    author: string;
    seconds: number;
    started: string;
    body: Record<string, unknown> | null;
    visibility: { value: string } | null;
  }>;
  history: Array<{
    id: string;
    author: string;
    created: string;
    items: Array<{ field: string; from?: string; to?: string }>;
  }>;
  links: Array<{ id: string; title: string; url: string }>;
};
function safeUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? value : undefined;
  } catch {
    return undefined;
  }
}
export function JiraDetailsPanel({ issueKey }: { issueKey: string }) {
  const query = useQuery({
    queryKey: ['jira-details', issueKey],
    queryFn: async () => (await apiClient.get<Details | null>(`/issues/${issueKey}/jira`)).data,
  });
  if (query.isLoading) return <p>Loading Jira data...</p>;
  if (query.isError) return <p role="alert">Could not load Jira data.</p>;
  const data = query.data;
  if (!data) return <p>This issue has no imported Jira data.</p>;
  return (
    <div className="space-y-5 text-sm">
      <p>
        Imported from{' '}
        <a className="underline" href={safeUrl(data.sourceUrl)} target="_blank" rel="noreferrer">
          {data.originalKey}
        </a>
        . Created by {data.creator}.
      </p>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <dt className="font-medium">Fix versions</dt>
          <dd>{data.fixVersions.map((v) => v.name).join(', ') || 'None'}</dd>
        </div>
        <div>
          <dt className="font-medium">Affected versions</dt>
          <dd>{data.affectedVersions.map((v) => v.name).join(', ') || 'None'}</dd>
        </div>
        <div>
          <dt className="font-medium">Components</dt>
          <dd>{data.components.map((v) => v.name).join(', ') || 'None'}</dd>
        </div>
        <div>
          <dt className="font-medium">Resolution</dt>
          <dd>{data.resolution || 'Unresolved'}</dd>
        </div>
        <div>
          <dt className="font-medium">Original estimate</dt>
          <dd>{data.originalEstimateSeconds ?? 0} seconds</dd>
        </div>
        <div>
          <dt className="font-medium">Remaining estimate</dt>
          <dd>{data.remainingEstimateSeconds ?? 0} seconds</dd>
        </div>
      </dl>
      <section className="space-y-3">
        <h3 className="font-semibold">Jira worklogs</h3>
        {data.worklogs.map((log) => (
          <article key={log.id} className="rounded border p-3">
            <p>
              {log.author}: {log.seconds} seconds, {new Date(log.started).toLocaleString()}
            </p>
            {log.visibility && <p className="text-amber-700">Restricted: {log.visibility.value}</p>}
            <RichTextRenderer issueKey={issueKey} content={log.body} />
          </article>
        ))}
      </section>
      {data.links.length > 0 && (
        <section>
          <h3 className="font-semibold">Linked resources</h3>
          <ul>
            {data.links.map((link) => (
              <li key={link.id}>
                <a className="underline" href={safeUrl(link.url)} target="_blank" rel="noreferrer">
                  {link.title || link.url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <details>
        <summary className="cursor-pointer font-semibold">
          Jira change history ({data.history.length})
        </summary>
        <div className="mt-3 space-y-3">
          {data.history.map((change) => (
            <article key={change.id} className="rounded border p-3">
              <p>
                {change.author}, {new Date(change.created).toLocaleString()}
              </p>
              {change.items.map((item, index) => (
                <p key={index}>
                  {item.field}: {item.from ?? 'Empty'} → {item.to ?? 'Empty'}
                </p>
              ))}
            </article>
          ))}
        </div>
      </details>
    </div>
  );
}
