import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { useRegister } from '@/api';
import { useAuthStore } from '@/stores';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SocialSignInButtons } from './SocialSignInButtons';

function registerErrorMessage(error: unknown): ReactNode {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  const message = isAxiosError(error) ? error.response?.data?.message : undefined;
  if (status === 409 && typeof message === 'string' && message.includes('email')) {
    return (
      <>
        An account with this email already exists.{' '}
        <Link to="/login" className="font-medium underline">
          Sign in
        </Link>{' '}
        or{' '}
        <Link to="/forgot-password" className="font-medium underline">
          reset your password
        </Link>
        .
      </>
    );
  }
  if (status === 409) {
    return 'That organization slug is taken. Choose another one.';
  }
  if (status === 429) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  return 'Registration failed. Please check your details and try again.';
}

export function RegisterPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const registerMutation = useRegister();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const result = await registerMutation.mutateAsync({
        email,
        password,
        displayName,
        orgName,
        orgSlug,
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
          <CardTitle className="text-2xl font-bold text-primary">Weaver</CardTitle>
          <CardDescription>Create a new account</CardDescription>
        </CardHeader>

        <CardContent>
          <SocialSignInButtons
            hint="Sign up with Google or GitHub, then name your organization."
            divider="or sign up with email"
          />

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="John Doe"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input
                id="orgName"
                type="text"
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="My Company"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="orgSlug">Organization Slug</Label>
              <Input
                id="orgSlug"
                type="text"
                required
                value={orgSlug}
                onChange={(e) => setOrgSlug(e.target.value)}
                placeholder="my-company"
              />
            </div>

            {registerMutation.isError && (
              <p role="alert" className="text-sm text-destructive">
                {registerErrorMessage(registerMutation.error)}
              </p>
            )}

            <Button type="submit" disabled={registerMutation.isPending} className="w-full">
              {registerMutation.isPending ? 'Creating account...' : 'Create account'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary hover:text-primary/80">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
