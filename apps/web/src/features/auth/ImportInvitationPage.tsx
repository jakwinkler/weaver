import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useAuthStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { User } from '@weaver/shared';

export function ImportInvitationPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const login = useAuthStore((state) => state.login);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const preview = useQuery({
    queryKey: ['import-invitation', token],
    queryFn: async () =>
      (
        await apiClient.get<{ organizationName: string; email: string; displayName: string }>(
          `/auth/import-invitations/${token}`,
        )
      ).data,
    retry: false,
  });
  const accept = useMutation({
    mutationFn: async (claim: boolean) =>
      (
        await apiClient.post<{ accessToken: string; user: User; tenantId: string }>(
          `/auth/import-invitations/${token}/${claim ? 'claim' : 'accept'}`,
          claim ? {} : { displayName: name || preview.data?.displayName, password },
        )
      ).data,
    onSuccess: (session) => {
      cache.clear();
      login(session.accessToken, session.user, session.tenantId);
      navigate('/projects');
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    accept.mutate(false);
  };
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Accept your Weaver invitation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {preview.isLoading && <p>Checking invitation...</p>}
          {preview.isError && (
            <p role="alert">This invitation is invalid, expired, or has already been accepted.</p>
          )}
          {preview.data && (
            <>
              <p>
                You are invited to {preview.data.organizationName} as {preview.data.email}.
              </p>
              <p className="text-sm text-muted-foreground">
                Use your current password if you already have a Weaver account. If you use single
                sign on, sign in first, then return to this invitation.
              </p>
              <form onSubmit={submit} className="space-y-3">
                <label className="block">
                  Name
                  <Input
                    value={name || preview.data.displayName}
                    onChange={(event) => setName(event.target.value)}
                    required
                    maxLength={255}
                  />
                </label>
                <label className="block">
                  Password
                  <Input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={10}
                    maxLength={200}
                    required
                    autoComplete="current-password"
                  />
                </label>
                <Button disabled={accept.isPending}>Accept invitation</Button>
              </form>
              <Button
                variant="outline"
                onClick={() => accept.mutate(true)}
                disabled={accept.isPending}
              >
                Accept using my signed-in account
              </Button>
              <p>
                <Link className="underline" to="/login" target="_blank" rel="noreferrer">
                  Sign in in another tab
                </Link>
              </p>
            </>
          )}
          {accept.isError && (
            <p role="alert">
              Could not accept this invitation. Check the password or sign in with the invited
              account.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
