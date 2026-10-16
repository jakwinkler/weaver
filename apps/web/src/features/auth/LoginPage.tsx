import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { useLogin } from '@/api';
import { useAuthStore } from '@/stores';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SocialSignInButtons } from './SocialSignInButtons';

export interface LoginLocationState {
  notice?: 'password-changed';
}

function loginErrorMessage(error: unknown): string {
  if (isAxiosError(error) && error.response?.status === 429) {
    return 'Too many sign-in attempts. Wait a minute and try again.';
  }
  if (isAxiosError(error) && (error.response?.status ?? 0) >= 500) {
    return 'Weaver could not sign you in right now. Try again shortly.';
  }
  return 'Invalid email or password. Please try again.';
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((s) => s.login);
  const loginMutation = useLogin();
  const notice = (location.state as LoginLocationState | null)?.notice;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const result = await loginMutation.mutateAsync({ email, password });
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
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>

        <CardContent>
          {notice === 'password-changed' && (
            <p role="status" className="mb-5 rounded-md border border-border bg-muted p-3 text-sm">
              Your password was changed. Sign in with your new password.
            </p>
          )}

          <SocialSignInButtons
            hint="New to Weaver? Either button also creates your account, then asks you to name your organization."
            divider="or sign in with email"
          />

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-sm font-medium text-primary hover:text-primary/80"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
            </div>

            {loginMutation.isError && (
              <p role="alert" className="text-sm text-destructive">
                {loginErrorMessage(loginMutation.error)}
              </p>
            )}

            <Button type="submit" disabled={loginMutation.isPending} className="w-full">
              {loginMutation.isPending ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="font-medium text-primary hover:text-primary/80">
              Create one
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
