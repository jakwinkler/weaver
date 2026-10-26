import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useUsers, useProjects } from '@/api';
import type { TenantUser } from '@/api/hooks-admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Person = {
  id: string;
  displayName: string;
  email: string | null;
  accountType: string;
  sourceActive: boolean;
  projectIds: string[];
  status: string;
  inviteEmail: string | null;
  linkedUserId?: string | null;
};
type Audience = { id: string; name: string; kind: string; userIds: string[] };
type InviteResult = { personId: string; email: string; status: string; url?: string };

const words = (value: string | null | undefined) =>
  (value ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
const isPrefix = (short: string[], long: string[]) =>
  short.length > 0 && short.every((word, index) => long[index] === word);
const memberName = (user: TenantUser | undefined) =>
  user ? user.displayName || user.email : 'a member';

/** Suggests a member only on an email match or a single unambiguous name match. */
export function suggestMember(person: Person, users: TenantUser[]) {
  if (person.email) {
    const email = person.email.toLowerCase();
    const match = users.find((user) => user.email.toLowerCase() === email);
    if (match) return { user: match, reason: 'email' as const };
  }
  const name = words(person.displayName);
  const matches = users.filter((user) => {
    const other = words(user.displayName);
    return isPrefix(other, name) || isPrefix(name, other);
  });
  return matches.length === 1 ? { user: matches[0], reason: 'name' as const } : null;
}

function LinkMember({
  person,
  users,
  onLinked,
}: {
  person: Person;
  users: TenantUser[];
  onLinked: () => void;
}) {
  const cache = useQueryClient();
  const suggestion = suggestMember(person, users);
  const [chosen, setChosen] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const target = chosen ?? suggestion?.user.id ?? '';
  const name = memberName(users.find((user) => user.id === target));
  const link = useMutation({
    mutationFn: async () => apiClient.post(`/import/people/${person.id}/link`, { userId: target }),
    onSuccess: () => {
      setConfirming(false);
      onLinked();
      cache.invalidateQueries({ queryKey: ['import-people'] });
    },
  });
  return (
    <>
      <div className="flex items-center gap-2">
        <select
          aria-label={`Existing member for ${person.displayName}`}
          className="rounded border p-2 text-sm"
          value={target}
          onChange={(event) => {
            setConfirming(false);
            setChosen(event.target.value);
          }}
        >
          <option value="">Link to existing member...</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.displayName ? `${user.displayName} (${user.email})` : user.email}
            </option>
          ))}
        </select>
        {chosen === undefined && suggestion && (
          <span className="text-xs text-muted-foreground">Suggested by {suggestion.reason}</span>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!target}
          onClick={() => setConfirming(true)}
        >
          Link
        </Button>
      </div>
      {confirming && target && (
        <div
          role="region"
          aria-label={`Link review for ${person.displayName}`}
          className="basis-full space-y-2 rounded border p-3"
        >
          <p className="text-sm">
            Issues, comments, worklogs, files and mentions imported for {person.displayName} will be
            attributed to {name}, and future imports will keep using that member. This cannot be
            undone. Project access is unchanged.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={link.isPending} onClick={() => link.mutate()}>
              Link to {name}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
          {link.isError && (
            <p role="alert">
              Could not link this person. Check that the import has finished and the member is still
              active.
            </p>
          )}
        </div>
      )}
    </>
  );
}

function AudienceForm({ audience }: { audience: Audience }) {
  const { data: users = [] } = useUsers();
  const [selected, setSelected] = useState(audience.userIds);
  const cache = useQueryClient();
  const save = useMutation({
    mutationFn: async () =>
      apiClient.post(`/import/audiences/${audience.id}`, { userIds: selected }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ['import-audiences'] }),
  });
  return (
    <form
      className="space-y-3 rounded border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <p className="font-medium">
        {audience.name} <span className="text-sm text-muted-foreground">({audience.kind})</span>
      </p>
      <p className="text-sm text-muted-foreground">
        Administrators can review this content. Select the active members who should also be able to
        read it.
      </p>
      <div className="flex flex-wrap gap-4">
        {users.map((user) => (
          <label key={user.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!['role', 'group'].includes(audience.kind)}
              checked={selected.includes(user.id)}
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? [...selected, user.id]
                    : selected.filter((id) => id !== user.id),
                )
              }
            />
            {user.displayName || user.email}
          </label>
        ))}
      </div>
      {!['role', 'group'].includes(audience.kind) && (
        <p>{audience.name === 'Imported Jira file requires access review' ? "Review individual files in each issue's Attachments tab after the final import." : 'Reimport with an authorized Jira account to verify this restriction.'}</p>
      )}
      <Button size="sm" disabled={save.isPending || !['role', 'group'].includes(audience.kind)}>
        Save audience
      </Button>
      {save.isSuccess && <p role="status">Audience saved.</p>}
      {save.isError && <p role="alert">Could not save this audience.</p>}
    </form>
  );
}

export function ImportedPeoplePanel() {
  const cache = useQueryClient();
  const people = useQuery({
    queryKey: ['import-people'],
    queryFn: async () => (await apiClient.get<Person[]>('/import/people')).data,
  });
  const audiences = useQuery({
    queryKey: ['import-audiences'],
    queryFn: async () => (await apiClient.get<Audience[]>('/import/audiences')).data,
  });
  const { data: projects } = useProjects();
  const { data: users = [] } = useUsers();
  const [selected, setSelected] = useState<string[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [role, setRole] = useState<'viewer' | 'member'>('viewer');
  const [delivery, setDelivery] = useState<'email' | 'link'>('link');
  const [review, setReview] = useState(false);
  const [results, setResults] = useState<InviteResult[]>([]);
  const chosen = (people.data ?? []).filter((person) => selected.includes(person.id));
  const nameProject = (id: string) =>
    projects?.data.find((project) => project.id === id)?.name ?? id;
  const invite = useMutation({
    mutationFn: async () =>
      (
        await apiClient.post<InviteResult[]>('/import/invitations', {
          invitations: chosen.map((person) => ({
            personId: person.id,
            email: emails[person.id] ?? person.email ?? '',
            role,
            projectIds: person.projectIds,
            delivery,
          })),
        })
      ).data,
    onSuccess: (data) => {
      setResults(data);
      setReview(false);
      setSelected([]);
      cache.invalidateQueries({ queryKey: ['import-people'] });
    },
  });
  const revoke = useMutation({
    mutationFn: async (id: string) => apiClient.post(`/import/people/${id}/revoke`),
    onSuccess: () => cache.invalidateQueries({ queryKey: ['import-people'] }),
  });
  if (people.isLoading) return <p>Loading imported people...</p>;
  if (people.isError || audiences.isError)
    return <p role="alert">Could not load the imported people and restricted audiences.</p>;
  if (!people.data?.length && !audiences.data?.length) return null;
  return (
    <section
      className="my-6 space-y-5 rounded border bg-card p-5"
      aria-label="Imported people and access"
    >
      <h2 className="text-lg font-semibold">Imported people and restricted audiences</h2>
      <p className="text-sm text-muted-foreground">
        Imported people preserve authorship without a login or project access. Link a person who
        already has an account here to that member, or select people when you are ready to invite
        them. Access starts only after acceptance, and historical notifications are never replayed.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setReview(true);
        }}
        className="space-y-4"
      >
        <div className="max-h-96 space-y-3 overflow-auto">
          {people.data?.map((person) => (
            <div key={person.id} className="flex flex-wrap items-center gap-3 rounded border p-3">
              <label className="flex min-w-48 items-center gap-2">
                <input
                  type="checkbox"
                  disabled={
                    person.status === 'active' ||
                    !['atlassian', 'customer'].includes(person.accountType)
                  }
                  checked={selected.includes(person.id)}
                  onChange={(event) => {
                    setReview(false);
                    setSelected(
                      event.target.checked
                        ? [...selected, person.id]
                        : selected.filter((id) => id !== person.id),
                    );
                  }}
                />
                <span>
                  {person.displayName}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {person.linkedUserId
                      ? `linked to ${memberName(users.find((user) => user.id === person.linkedUserId))}`
                      : person.status}
                    {!person.sourceActive ? ' · historical' : ''}
                  </span>
                </span>
              </label>
              <Input
                aria-label={`Invitation email for ${person.displayName}`}
                className="max-w-xs"
                type="email"
                disabled={person.status === 'active'}
                value={emails[person.id] ?? person.email ?? ''}
                onChange={(event) => {
                  setReview(false);
                  setEmails({ ...emails, [person.id]: event.target.value });
                }}
                placeholder="Email needed before inviting"
              />
              <span className="text-xs text-muted-foreground">
                {person.projectIds.map(nameProject).join(', ')}
              </span>
              {person.status === 'invited' && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => revoke.mutate(person.id)}
                >
                  Revoke invitation
                </Button>
              )}
              {person.status !== 'active' &&
                ['atlassian', 'customer'].includes(person.accountType) && (
                  <LinkMember
                    person={person}
                    users={users}
                    onLinked={() => setSelected((ids) => ids.filter((id) => id !== person.id))}
                  />
                )}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <label className="space-y-1 text-sm">
            <span className="block">Project role</span>
            <select
              className="rounded border p-2"
              value={role}
              onChange={(event) => {
                setReview(false);
                setRole(event.target.value as typeof role);
              }}
            >
              <option value="viewer">Viewer</option>
              <option value="member">Member</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="block">Invitation delivery</span>
            <select
              className="rounded border p-2"
              value={delivery}
              onChange={(event) => {
                setReview(false);
                setDelivery(event.target.value as typeof delivery);
              }}
            >
              <option value="link">Create links to share privately</option>
              <option value="email">Send email invitations</option>
            </select>
          </label>
          <Button
            disabled={
              !chosen.length ||
              chosen.some((p) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emails[p.id] ?? p.email ?? ''))
            }
          >
            Review {chosen.length} {chosen.length === 1 ? 'invitation' : 'invitations'}
          </Button>
        </div>
      </form>
      {review && (
        <div className="space-y-3 rounded border p-4" role="region" aria-label="Invitation review">
          <p className="font-medium">Review recipients and access</p>
          <ul className="list-inside list-disc">
            {chosen.map((person) => (
              <li key={person.id}>
                {person.displayName}: {emails[person.id] ?? person.email}, {role}, projects:{' '}
                {person.projectIds.map(nameProject).join(', ')}
              </li>
            ))}
          </ul>
          <Button onClick={() => invite.mutate()} disabled={invite.isPending}>
            {delivery === 'email'
              ? `Send ${chosen.length} ${chosen.length === 1 ? 'invitation' : 'invitations'}`
              : `Create ${chosen.length} invitation ${chosen.length === 1 ? 'link' : 'links'}`}
          </Button>
        </div>
      )}
      {invite.isError && (
        <p role="alert">
          Could not create invitations. Check that the import has finished and every email and
          project selection is valid.
        </p>
      )}
      {results.length > 0 && (
        <div className="space-y-2" role="status">
          {results.map((result) => (
            <div key={result.personId}>
              <p>
                {result.email}: {result.status.replaceAll('_', ' ')}
              </p>
              {result.url && (
                <Input
                  aria-label={`Invitation link for ${result.email}`}
                  readOnly
                  value={result.url}
                  onFocus={(event) => event.target.select()}
                />
              )}
            </div>
          ))}
        </div>
      )}
      {audiences.data?.length ? (
        <div className="space-y-3">
          <h3 className="font-semibold">Restricted audiences</h3>
          {audiences.data.map((audience) => (
            <AudienceForm
              key={`${audience.id}:${audience.userIds.join(',')}`}
              audience={audience}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
