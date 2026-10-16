import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { useConfirmPasswordReset } from '@/api';
import { queryClient } from '@/api/query-client';
import { clearLocalSession } from '@/auth/clear-local-session';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { LoginLocationState } from './LoginPage';

export const RESET_PASSWORD_PATH = '/reset-password';

/** The reset link must never travel in a Referer header, even to this site's own API. */
function useNoReferrer() {
  useEffect(() => {
    const existing = document.head.querySelector<HTMLMetaElement>('meta[name="referrer"]');
    const meta = existing ?? document.createElement('meta');
    const previous = existing?.content;
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    if (!existing) document.head.appendChild(meta);
    return () => {
      if (previous === undefined) meta.remove();
      else meta.content = previous;
    };
  }, []);
}

type ResetFailure = 'invalid' | 'throttled' | 'unknown';

function failureKind(error: unknown): ResetFailure {
  if (isAxiosError(error) && error.response?.status === 400) return 'invalid';
  if (isAxiosError(error) && error.response?.status === 429) return 'throttled';
  return 'unknown';
}

export function ResetPasswordPage() {
  const { token: tokenFromUrl } = useParams<{ token: string }>();
  // Held in memory only. Reloading the page forgets it on purpose.
  const [token] = useState(() => tokenFromUrl ?? null);
  const navigate = useNavigate();
  const confirm = useConfirmPasswordReset();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [mismatch, setMismatch] = useState(false);

  useNoReferrer();

  useEffect(() => {
    // Take the token out of the address bar and browser history.
    if (tokenFromUrl && window.location.pathname !== RESET_PASSWORD_PATH) {
      window.history.replaceState(window.history.state, '', RESET_PASSWORD_PATH);
    }
  }, [tokenFromUrl]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    if (password !== repeat) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    try {
      await confirm.mutateAsync({ token, password });
      // The server signed this account out everywhere, this browser included.
      clearLocalSession(queryClient);
      const state: LoginLocationState = { notice: 'password-changed' };
      navigate('/login', { replace: true, state });
    } catch {
      // The inline mutation error keeps the form available when another attempt can work.
    }
  };

  const failure = confirm.isError ? failureKind(confirm.error) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary">Choose a new password</CardTitle>
          <CardDescription>
            {token ? 'Use 8 to 128 characters.' : 'This page needs the link from your email'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!token || failure === 'invalid' ? (
            <div className="space-y-4 text-sm">
              <p role="alert">
                {token
                  ? 'This reset link is invalid, expired, or already used.'
                  : 'Open the reset link from your email again. For your security, this page forgets the link when it reloads.'}
              </p>
              <Button asChild className="w-full">
                <Link to="/forgot-password">Request a new link</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="repeatPassword">Confirm new password</Label>
                <Input
                  id="repeatPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={128}
                  value={repeat}
                  onChange={(event) => setRepeat(event.target.value)}
                />
              </div>
              {mismatch && (
                <p role="alert" className="text-sm text-destructive">
                  The passwords don&apos;t match.
                </p>
              )}
              {failure === 'throttled' && (
                <p role="alert" className="text-sm text-destructive">
                  Too many attempts. Wait 15 minutes and try again.
                </p>
              )}
              {failure === 'unknown' && (
                <p role="alert" className="text-sm text-destructive">
                  Weaver could not change the password right now. Try again shortly.
                </p>
              )}
              <Button type="submit" className="w-full" disabled={confirm.isPending}>
                {confirm.isPending ? 'Saving...' : 'Change password'}
              </Button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link to="/login" className="font-medium text-primary hover:text-primary/80">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
