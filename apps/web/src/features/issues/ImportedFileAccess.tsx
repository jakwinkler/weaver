import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useCurrentUser } from '@/api';
import { Button } from '@/components/ui/button';

type Audience = {
  id: string;
  sourceInstance: string;
  kind: string;
  identifier: string;
  name: string;
};
type File = {
  id: string;
  filename: string;
  sourceId?: string | null;
  visibility?: { sourceInstance: string; type: string; identifier: string; value: string } | null;
};

export function ImportedFileAccess({ file, issueKey }: { file: File; issueKey: string }) {
  const { data: user } = useCurrentUser();
  const administrator = user?.role === 'owner' || user?.role === 'admin';
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState('');
  const cache = useQueryClient();
  const audiences = useQuery({
    queryKey: ['import-audiences'],
    queryFn: async () => (await apiClient.get<Audience[]>('/import/audiences')).data,
    enabled: administrator && editing,
  });
  const save = useMutation({
    mutationFn: async () =>
      apiClient.post(`/import/attachments/${file.id}/visibility`, {
        audienceId: choice === 'project' ? null : choice,
      }),
    onSuccess: async () => {
      setEditing(false);
      await cache.invalidateQueries({ queryKey: ['attachments', issueKey] });
    },
  });
  if (!file.sourceId) return null;
  return (
    <div className="mt-2 space-y-2 text-xs">
      <p>
        {file.visibility ? `Restricted: ${file.visibility.value}` : 'Available to project readers'}
      </p>
      {administrator && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setChoice('');
            setEditing(!editing);
          }}
        >
          Review file access
        </Button>
      )}
      {editing && (
        <div className="space-y-2" role="region" aria-label={`File access for ${file.filename}`}>
          <p>
            Jira files can belong to private comments. Check this file before granting access.
            Reimport resets this review.
          </p>
          <label className="block">
            Allow access for {file.filename}
            <select
              className="mt-1 block max-w-full rounded border p-2"
              value={choice}
              onChange={(event) => setChoice(event.target.value)}
            >
              <option value="">Keep current access</option>
              <option value="project">All project readers</option>
              {audiences.data
                ?.filter(
                  (audience) =>
                    ['role', 'group'].includes(audience.kind) &&
                    (!file.visibility ||
                      audience.sourceInstance === file.visibility.sourceInstance),
                )
                .map((audience) => (
                  <option key={audience.id} value={audience.id}>
                    {audience.name}
                  </option>
                ))}
            </select>
          </label>
          <Button
            type="button"
            size="sm"
            disabled={!choice || save.isPending}
            onClick={() => save.mutate()}
          >
            Apply file access
          </Button>
          {(save.isError || audiences.isError) && (
            <p role="alert">
              Could not update file access. Check the import has finished and the audience belongs
              to this source.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
