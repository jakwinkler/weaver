import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLogin } from '@/api';
import { useAuthStore } from '@/stores';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Github } from 'lucide-react';
import { API_BASE_URL } from '@/api/client';

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const loginMutation = useLogin();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await loginMutation.mutateAsync({ email, password });
    login(result.accessToken, result.user, result.tenantId);
    navigate('/projects');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary">Weaver</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>

        <CardContent>
          <div className="mb-5 grid gap-3">
            <Button asChild variant="outline" className="w-full">
              <a href={`${API_BASE_URL}/auth/google`}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M21.35 12.24c0-.69-.06-1.2-.2-1.73H12v3.32h5.37a4.65 4.65 0 0 1-2 3.05l-.02.11 2.9 2.24.2.02c1.84-1.7 2.9-4.2 2.9-7.01ZM12 21.75c2.63 0 4.83-.87 6.44-2.5l-3.07-2.37c-.82.55-1.94.94-3.37.94a5.85 5.85 0 0 1-5.54-4.04l-.1.01-3.02 2.34-.04.1A9.73 9.73 0 0 0 12 21.75ZM6.46 13.78A5.99 5.99 0 0 1 6.14 12c0-.62.11-1.22.3-1.78v-.12L3.4 7.72l-.1.05A9.77 9.77 0 0 0 2.25 12c0 1.52.36 2.96 1.05 4.23l3.16-2.45ZM12 6.18c1.83 0 3.06.79 3.76 1.44l2.75-2.68A9.36 9.36 0 0 0 12 2.25a9.73 9.73 0 0 0-8.7 5.52l3.14 2.45A5.87 5.87 0 0 1 12 6.18Z"
                  />
                </svg>
                Sign in with Google
              </a>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <a href={`${API_BASE_URL}/auth/github`}>
                <Github aria-hidden="true" />
                Sign in with GitHub
              </a>
            </Button>
          </div>

          <div className="mb-5 flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or use your password
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
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
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
            </div>

            {loginMutation.isError && (
              <p className="text-sm text-destructive">
                Invalid email or password. Please try again.
              </p>
            )}

            <Button type="submit" disabled={loginMutation.isPending} className="w-full">
              {loginMutation.isPending ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="font-medium text-primary hover:text-primary/80">
              Register
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
