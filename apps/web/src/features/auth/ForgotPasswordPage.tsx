import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { useRequestPasswordReset } from '@/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function requestErrorMessage(error: unknown): string {
  if (isAxiosError(error) && error.response?.status === 429) {
    return 'Too many reset requests. Wait 15 minutes and try again.';
  }
  if (isAxiosError(error) && error.response?.status === 400) {
    return 'Enter a valid email address.';
  }
  return 'Weaver could not take the request right now. Try again shortly.';
}

export function ForgotPasswordPage() {
  const request = useRequestPasswordReset();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await request.mutateAsync({ email });
      setSentTo(email);
    } catch {
      // The inline mutation error keeps the form available for another attempt.
    }
  };

  const startOver = () => {
    request.reset();
    setSentTo(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary">Reset your password</CardTitle>
          <CardDescription>
            {sentTo ? 'Check your email' : "Enter your account's email address"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sentTo ? (
            <div className="space-y-4 text-sm">
              <p role="status">
                If an account uses <strong className="break-all">{sentTo}</strong>, we sent it a
                link to reset the password. The link works once and expires in 30 minutes.
              </p>
              <p className="text-muted-foreground">
                No email after a few minutes? Check your spam folder and the spelling of the
                address. If you sign in with Google, GitHub, or your organization&apos;s single
                sign-on, the email explains how to sign in instead. If nothing arrives at all, your
                Weaver administrator may need to set up email.
              </p>
              <Button type="button" variant="outline" className="w-full" onClick={startOver}>
                Use a different email
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="resetEmail">Email</Label>
                <Input
                  id="resetEmail"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={255}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              {request.isError && (
                <p role="alert" className="text-sm text-destructive">
                  {requestErrorMessage(request.error)}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={request.isPending}>
                {request.isPending ? 'Sending...' : 'Send reset link'}
              </Button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Remembered it?{' '}
            <Link to="/login" className="font-medium text-primary hover:text-primary/80">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
