import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAcceptInvitation, useInvitation } from '@/api';
import { useAuthStore } from '@/stores';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function InvitationPage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const invitation = useInvitation(token);
  const accept = useAcceptInvitation(token);
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!invitation.data) return;
    try {
      const result = await accept.mutateAsync({
        email: invitation.data.email,
        displayName,
        password,
      });
      login(result.accessToken, result.user, result.tenantId);
      navigate('/projects');
    } catch {
      // The inline mutation error keeps the form available for another attempt.
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary">Join Weaver</CardTitle>
          <CardDescription>
            {invitation.data
              ? `Join ${invitation.data.organizationName} as ${invitation.data.role}`
              : 'Checking your invitation'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invitation.isLoading && <p>Loading invitation...</p>}
          {invitation.isError && (
            <p role="alert">This invitation is invalid, expired, or already used.</p>
          )}
          {invitation.data && (
            <form onSubmit={submit} className="space-y-4">
              <p className="text-sm text-muted-foreground">Invited email: {invitation.data.email}</p>
              <div className="space-y-2">
                <Label htmlFor="invitedDisplayName">Display Name</Label>
                <Input id="invitedDisplayName" required value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invitedPassword">Password</Label>
                <Input id="invitedPassword" type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} />
                <p className="text-xs text-muted-foreground">Use your existing password if you already have a Weaver account.</p>
                <p className="text-xs text-muted-foreground">If you normally use a sign-in button and have no Weaver password, ask your team for help joining.</p>
              </div>
              {accept.isError && <p role="alert" className="text-sm text-destructive">Could not join. Check your password or ask for a new invitation.</p>}
              <Button type="submit" disabled={accept.isPending} className="w-full">Join organization</Button>
            </form>
          )}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link to="/login" className="font-medium text-primary hover:text-primary/80">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
