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
  provider?: string;
  blockedOrganizationCount?: number;
  organizations: OrganizationChoice[];
}

const PROVIDER_NAMES: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  saml: 'SAML single sign-on',
  oidc: 'OIDC single sign-on',
};

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

  const providerName = PROVIDER_NAMES[context?.provider ?? ''] ?? 'this sign-in method';
  const blocked = context?.blockedOrganizationCount ?? 0;
  const choosing = !!context?.organizations.length;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/50 px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            {!context
              ? 'Finishing sign-in'
              : choosing
                ? 'Choose an organization'
                : blocked > 0
                  ? 'Sign in another way'
                  : 'Create your organization'}
          </CardTitle>
          <CardDescription>
            {!context
              ? 'Loading your organizations.'
              : choosing
                ? 'Choose the organization you want to enter.'
                : blocked > 0
                  ? `${providerName} confirmed your email as ${context.user.email}.`
                  : `Your Weaver account for ${context.user.email} is ready. Name your organization to finish.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {context && !choosing && blocked > 0 && (
            <div role="status" className="space-y-3 rounded-md border border-border bg-muted p-4 text-sm">
              <p>
                Your account already belongs to{' '}
                {blocked === 1
                  ? "an organization that doesn't"
                  : `${blocked} organizations that don't`}{' '}
                allow {providerName} sign-in. Sign in with your password or your organization&apos;s
                single sign-on link instead.
              </p>
              <Button asChild className="w-full">
                <Link to="/login">Back to sign in</Link>
              </Button>
            </div>
          )}
          {context && !choosing && blocked === 0 && (
            <p className="text-sm text-muted-foreground">
              Joining a team that already uses Weaver? Don&apos;t create an organization. Ask its
              owner to invite {context.user.email}, then open the invitation link.
            </p>
          )}
          {!context ? (
            <p className="text-sm text-muted-foreground">Loading organizations…</p>
          ) : choosing ? (
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
              {blocked > 0 && (
                <h2 className="text-sm font-semibold">Or create a new organization</h2>
              )}
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
