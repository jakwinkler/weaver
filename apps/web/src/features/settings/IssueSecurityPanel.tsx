import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useUsers } from '@/api';
import { Button } from '@/components/ui/button';

type Policy = {
  id: string;
  name: string;
  securityLevelId: string;
  sourceInstance: string;
  projectName: string;
  projectKey: string;
  projectMemberIds: string[];
  userIds: string[];
  revision: number;
  reviewed: boolean;
  affectedCount: number;
};
type Pending = {
  id: string;
  key: string;
  summary: string;
  updatedAt: string;
  sourceSecurity: { verified: boolean; levelId: string | null } | null;
};

function PolicyForm({ policy }: { policy: Policy }) {
  const { data: users = [] } = useUsers();
  const cache = useQueryClient();
  const [selected, setSelected] = useState(policy.userIds);
  const [review, setReview] = useState(false);
  const name = (id: string) =>
    users.find((user) => user.id === id)?.displayName ||
    users.find((user) => user.id === id)?.email ||
    'Former member';
  const save = useMutation({
    mutationFn: () =>
      apiClient.post(`/import/issue-security/${policy.id}`, {
        userIds: selected,
        revision: policy.revision,
        affectedCount: policy.affectedCount,
      }),
    onSuccess: () => {
      setReview(false);
      void cache.invalidateQueries();
    },
  });
  return (
    <div className="space-y-3 rounded border p-4">
      <h3 className="font-medium">
        {policy.projectName}: {policy.name}
      </h3>
      <p className="text-sm text-muted-foreground">
        {policy.affectedCount} issues.{' '}
        {policy.reviewed ? 'Audience reviewed' : 'Awaiting audience review'}. Owners and
        administrators always have access.
      </p>
      <details className="text-sm">
        <summary>Source details</summary>
        <p>
          {policy.sourceInstance}, {policy.projectKey}, security level {policy.securityLevelId}
        </p>
      </details>
      <div className="flex flex-wrap gap-4">
        {users.map((user) => (
          <label key={user.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(user.id)}
              onChange={(event) => {
                setReview(false);
                setSelected(
                  event.target.checked
                    ? [...selected, user.id]
                    : selected.filter((id) => id !== user.id),
                );
              }}
            />
            {name(user.id)}
            {!policy.projectMemberIds.includes(user.id) && !['owner', 'admin'].includes(user.role)
              ? ' (project access also required)'
              : ''}
          </label>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={() => setReview(true)}>
        Review issue audience
      </Button>
      {review && (
        <div
          role="region"
          aria-label={`Audience review for ${policy.projectKey} ${policy.name}`}
          className="space-y-2 rounded border p-3"
        >
          <p>
            Applies to {policy.affectedCount} issues in {policy.projectName}.
          </p>
          <p>
            Add:{' '}
            {selected
              .filter((id) => !policy.userIds.includes(id))
              .map(name)
              .join(', ') || 'Nobody'}
          </p>
          <p>
            Remove:{' '}
            {policy.userIds
              .filter((id) => !selected.includes(id))
              .map(name)
              .join(', ') || 'Nobody'}
          </p>
          <p>
            {selected.length
              ? 'Selected members still need project access. Comment and file restrictions remain in effect.'
              : 'Only owners and administrators will have access.'}{' '}
            Pending issue restriction changes require their own review below.
          </p>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Apply reviewed audience
          </Button>
        </div>
      )}
      {save.isError && (
        <p role="alert">
          Could not save. Finish any active import, then refresh and review the current audience and
          issue count.
        </p>
      )}
    </div>
  );
}

function PendingReview({ issue }: { issue: Pending }) {
  const [review, setReview] = useState(false);
  const cache = useQueryClient();
  const apply = useMutation({
    mutationFn: () =>
      apiClient.post(`/import/issue-security/issues/${issue.id}/review`, {
        updatedAt: issue.updatedAt,
        levelId: issue.sourceSecurity?.levelId,
      }),
    onSuccess: () => {
      setReview(false);
      void cache.invalidateQueries();
    },
  });
  return (
    <div className="space-y-2 rounded border p-3">
      <p>
        {issue.key}: {issue.summary}
      </p>
      {!issue.sourceSecurity?.verified ? (
        <p>
          Source security is unverified. Reimport with an authorized Jira account before reviewing
          access.
        </p>
      ) : (
        <>
          <p>
            {issue.sourceSecurity.levelId
              ? `Apply the reviewed audience for security level ${issue.sourceSecurity.levelId}.`
              : 'Jira no longer restricts this issue. Applying this change allows all project readers to see it.'}
          </p>
          <Button variant="outline" size="sm" onClick={() => setReview(true)}>
            Review restriction change
          </Button>
          {review && (
            <div role="region" aria-label={`Restriction review for ${issue.key}`}>
              <p>
                This changes access to {issue.key} and its related content, subject to narrower
                comment and file restrictions.
              </p>
              <Button disabled={apply.isPending} onClick={() => apply.mutate()}>
                Apply restriction change
              </Button>
            </div>
          )}
        </>
      )}
      {apply.isError && (
        <p role="alert">
          Could not apply. Review the level audience first, or refresh to review the latest source
          state.
        </p>
      )}
    </div>
  );
}

export function IssueSecurityPanel() {
  const state = useQuery({
    queryKey: ['import-issue-security'],
    queryFn: async () =>
      (await apiClient.get<{ policies: Policy[]; pending: Pending[] }>('/import/issue-security'))
        .data,
  });
  if (state.isLoading) return <p>Loading issue security levels...</p>;
  if (state.isError) return <p role="alert">Could not load issue security levels.</p>;
  if (!state.data?.policies.length && !state.data?.pending.length) return null;
  return (
    <section aria-label="Issue security levels" className="my-6 space-y-4 rounded border p-5">
      <h2 className="text-lg font-semibold">Issue security levels</h2>
      <p className="text-sm">
        Select who can read secured issues in each project. This does not create accounts, add
        project membership, or grant editing rights.
      </p>
      {state.data.policies.map((policy) => (
        <PolicyForm key={`${policy.id}:${policy.revision}`} policy={policy} />
      ))}
      {!!state.data.pending.length && (
        <h3 className="font-medium">Issue restrictions requiring review</h3>
      )}
      {state.data.pending.map((issue) => (
        <PendingReview key={`${issue.id}:${issue.updatedAt}`} issue={issue} />
      ))}
    </section>
  );
}
