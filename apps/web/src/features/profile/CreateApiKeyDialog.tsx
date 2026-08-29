import { useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Copy, KeyRound, Plus } from 'lucide-react';
import type { ApiKeyScope, CreatedApiKey } from '@weaver/shared';
import { useCreateApiKey } from '@/api/hooks-profile';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const SCOPE_DESCRIPTIONS: Record<ApiKeyScope, string> = {
  read: 'View projects, issues, and other workspace data.',
  write: 'Create and update workspace data.',
  admin: 'Access administrator-only operations.',
};

const API_KEY_SCOPES = ['read', 'write', 'admin'] as const satisfies readonly ApiKeyScope[];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CreateApiKeyDialog() {
  const createApiKey = useCreateApiKey();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiKeyScope[]>(['read']);
  const [expires, setExpires] = useState(false);
  const [expirationDate, setExpirationDate] = useState('');
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const reset = () => {
    setName('');
    setScopes(['read']);
    setExpires(false);
    setExpirationDate('');
    setCreated(null);
    setCopyStatus('idle');
    createApiKey.reset();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      reset();
    }
  };

  const toggleScope = (scope: ApiKeyScope, checked: boolean) => {
    setScopes((current) =>
      checked
        ? API_KEY_SCOPES.filter((candidate) => candidate === scope || current.includes(candidate))
        : current.filter((candidate) => candidate !== scope),
    );
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || scopes.length === 0 || (expires && !expirationDate)) {
      return;
    }

    try {
      const result = await createApiKey.mutateAsync({
        name: name.trim(),
        scopes,
        expiresAt: expires ? new Date(`${expirationDate}T23:59:59.999`).toISOString() : null,
      });
      setCreated(result);
    } catch {
      // The mutation state renders the error without retaining the secret.
    }
  };

  const copyKey = async () => {
    if (!created) return;

    try {
      await navigator.clipboard.writeText(created.key);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Create new key
        </Button>
      </DialogTrigger>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="text-primary" />
                API key created
              </DialogTitle>
              <DialogDescription>
                Save this key somewhere secure before closing this dialog.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                This will only be shown once. Weaver cannot recover it later.
              </div>
              <Label htmlFor="created-api-key">Your API key</Label>
              <div className="flex gap-2">
                <Input
                  id="created-api-key"
                  value={created.key}
                  readOnly
                  className="font-mono text-xs"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={copyKey}
                  aria-label="Copy API key"
                >
                  {copyStatus === 'copied' ? <Check /> : <Copy />}
                </Button>
              </div>
              <p className="min-h-5 text-sm text-muted-foreground" role="status">
                {copyStatus === 'copied'
                  ? 'Copied to clipboard.'
                  : copyStatus === 'failed'
                    ? 'Copy failed. Select the key and copy it manually.'
                    : ''}
              </p>
            </div>

            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Create API key</DialogTitle>
              <DialogDescription>
                Choose the smallest set of permissions your integration needs.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="api-key-name">Name</Label>
              <Input
                id="api-key-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="CI deployment"
                maxLength={255}
                autoFocus
              />
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Scopes</legend>
              {API_KEY_SCOPES.map((scope) => (
                <div key={scope} className="flex items-start gap-3">
                  <Checkbox
                    id={`api-key-scope-${scope}`}
                    checked={scopes.includes(scope)}
                    onCheckedChange={(checked) => toggleScope(scope, checked === true)}
                  />
                  <div className="grid gap-1 leading-none">
                    <Label htmlFor={`api-key-scope-${scope}`} className="capitalize">
                      {scope}
                    </Label>
                    <p className="text-sm text-muted-foreground">{SCOPE_DESCRIPTIONS[scope]}</p>
                  </div>
                </div>
              ))}
              {scopes.length === 0 ? (
                <p className="text-sm text-destructive" role="alert">
                  Select at least one scope.
                </p>
              ) : null}
            </fieldset>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="api-key-expires"
                  checked={expires}
                  onCheckedChange={(checked) => setExpires(checked === true)}
                />
                <Label htmlFor="api-key-expires">Set an expiration date</Label>
              </div>
              {expires ? (
                <div className="space-y-2 pl-7">
                  <Label htmlFor="api-key-expiration-date">Expiration date</Label>
                  <Input
                    id="api-key-expiration-date"
                    type="date"
                    min={today()}
                    value={expirationDate}
                    onChange={(event) => setExpirationDate(event.target.value)}
                  />
                </div>
              ) : (
                <p className="pl-7 text-sm text-muted-foreground">This key will not expire.</p>
              )}
            </div>

            {createApiKey.isError ? (
              <p className="text-sm text-destructive" role="alert">
                The API key could not be created. Please try again.
              </p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  createApiKey.isPending ||
                  !name.trim() ||
                  scopes.length === 0 ||
                  (expires && !expirationDate)
                }
              >
                {createApiKey.isPending ? 'Creating...' : 'Create key'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
