import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { User } from '@weaver/shared';
import { apiClient } from '@/api/client';
import { useAuthStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2 } from 'lucide-react';

interface OrganizationChoice {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface OAuthContext {
  user: User;
  organizations: OrganizationChoice[];
}

interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: User;
  tenantId: string;
}

export function OrgPicker() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const [context, setContext] = useState<OAuthContext | null>(null);
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    void apiClient
      .get<OAuthContext>('/auth/oauth-context')
      .then(({ data }) => setContext(data))
      .catch(() => setError(true));
  }, []);

  const finish = (session: AuthSession) => {
      login(session.accessToken, session.user, session.tenantId);
    navigate('/projects', { replace: true });
  };

  const selectOrganization = async (tenantId: string) => {
    setPending(true);
    setError(false);
    try {
      const { data } = await apiClient.post<AuthSession>('/auth/select-organization', {
        tenantId,
      });
      finish(data);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  const createOrganization = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(false);
    try {
      const { data } = await apiClient.post<AuthSession>('/auth/oauth-organizations', {
        orgName,
        orgSlug,
      });
      finish(data);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  if (error && !context) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/50 px-4 text-center">
        <div>
          <h1 className="text-xl font-semibold">Your sign-in session expired</h1>
          <Link
            to="/login"
            className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
          >
            Return to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/50 px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Join or Create Organization</CardTitle>
          <CardDescription>
            {context?.organizations.length
              ? 'Choose the organization you want to enter.'
              : 'Create your first organization to finish setting up Weaver.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!context ? (
            <p className="text-sm text-muted-foreground">Loading organizations…</p>
          ) : context.organizations.length > 0 ? (
            <div className="space-y-3">
              {context.organizations.map((organization) => (
                <button
                  key={organization.id}
                  type="button"
                  disabled={pending}
                  onClick={() => void selectOrganization(organization.id)}
                  className="flex w-full items-center gap-3 rounded-md border border-border p-4 text-left transition-colors hover:border-primary hover:bg-accent disabled:opacity-50"
                >
                  <Building2 className="h-5 w-5 text-primary" />
                  <span className="flex-1">
                    <span className="block font-medium text-foreground">{organization.name}</span>
                    <span className="block text-xs text-muted-foreground">{organization.slug}</span>
                  </span>
                  <span className="text-xs capitalize text-muted-foreground">
                    {organization.role}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <form onSubmit={createOrganization} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="oauth-org-name">Organization name</Label>
                <Input
                  id="oauth-org-name"
                  required
                  value={orgName}
                  onChange={(event) => setOrgName(event.target.value)}
                  placeholder="Acme, Inc."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="oauth-org-slug">Organization URL slug</Label>
                <Input
                  id="oauth-org-slug"
                  required
                  pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
                  minLength={2}
                  value={orgSlug}
                  onChange={(event) => setOrgSlug(event.target.value.toLowerCase())}
                  placeholder="acme"
                />
              </div>
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? 'Creating…' : 'Create organization'}
              </Button>
            </form>
          )}
          {error && context && (
            <p className="text-sm text-destructive">
              We could not finish organization setup. Check the details and try again.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
