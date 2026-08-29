import { KeyRound, Trash2 } from 'lucide-react';
import type { ApiKey } from '@weaver/shared';
import { useApiKeys, useDeleteApiKey } from '@/api/hooks-profile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CreateApiKeyDialog } from './CreateApiKeyDialog';

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
});

function formatDate(value: string | null): string {
  return value ? DATE_FORMATTER.format(new Date(value)) : 'Never';
}

function expirationLabel(apiKey: ApiKey): string {
  if (!apiKey.expiresAt) return 'Never';
  if (new Date(apiKey.expiresAt).getTime() <= Date.now()) return 'Expired';
  return formatDate(apiKey.expiresAt);
}

export function ApiKeysTab() {
  const { data: apiKeys = [], isLoading, isError } = useApiKeys();
  const deleteApiKey = useDeleteApiKey();

  const handleDelete = async (apiKey: ApiKey) => {
    const confirmed = window.confirm(
      `Delete the API key “${apiKey.name}”? Any integration using it will stop working immediately.`,
    );
    if (!confirmed) return;

    try {
      await deleteApiKey.mutateAsync(apiKey.id);
    } catch {
      // The mutation state renders the error inline.
    }
  };

  return (
    <section className="space-y-5" aria-labelledby="api-keys-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 id="api-keys-heading" className="text-lg font-semibold">
            Personal API keys
          </h2>
          <p className="text-sm text-muted-foreground">
            Use scoped keys for scripts, automation, and CI/CD access.
          </p>
        </div>
        <CreateApiKeyDialog />
      </div>

      {deleteApiKey.isError ? (
        <p className="text-sm text-destructive" role="alert">
          The API key could not be deleted. Please try again.
        </p>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div
            className="h-7 w-7 animate-spin rounded-full border-4 border-primary border-t-transparent"
            aria-label="Loading API keys"
          />
        </div>
      ) : isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          API keys could not be loaded. Refresh the page to try again.
        </div>
      ) : apiKeys.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
          <div className="rounded-full bg-muted p-3">
            <KeyRound className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">No API keys yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a key when an integration needs access to Weaver.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-14">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.map((apiKey) => (
                <TableRow key={apiKey.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-medium">{apiKey.name}</p>
                      <code className="text-xs text-muted-foreground">{apiKey.maskedKey}</code>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {apiKey.scopes.map((scope) => (
                        <Badge key={scope} variant="secondary" className="capitalize">
                          {scope}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(apiKey.createdAt)}</TableCell>
                  <TableCell>{formatDate(apiKey.lastUsedAt)}</TableCell>
                  <TableCell>{expirationLabel(apiKey)}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(apiKey)}
                      disabled={deleteApiKey.isPending && deleteApiKey.variables === apiKey.id}
                      aria-label={`Delete ${apiKey.name}`}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
