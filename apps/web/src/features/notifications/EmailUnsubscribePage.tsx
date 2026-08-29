import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiClient } from '@/api';
import { Button } from '@/components/ui/button';

type UnsubscribeState = 'loading' | 'success' | 'error';

export function EmailUnsubscribePage() {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<UnsubscribeState>('loading');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setState('error');
      return;
    }

    apiClient
      .post(`/notifications/unsubscribe?token=${encodeURIComponent(token)}`, {
        'List-Unsubscribe': 'One-Click',
      })
      .then(() => setState('success'))
      .catch(() => setState('error'));
  }, [searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-6">
      <div className="w-full max-w-md border border-border bg-background p-8 text-center shadow-sm">
        {state === 'loading' && (
          <>
            <h1 className="text-xl font-semibold">Updating your preferences</h1>
            <p className="mt-2 text-sm text-muted-foreground">Please wait a moment.</p>
          </>
        )}
        {state === 'success' && (
          <>
            <h1 className="text-xl font-semibold">You are unsubscribed</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This type of email has been turned off. You can change it again from your Weaver
              profile.
            </p>
          </>
        )}
        {state === 'error' && (
          <>
            <h1 className="text-xl font-semibold">We could not unsubscribe you</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The link may be invalid. Open your profile to change email preferences.
            </p>
          </>
        )}
        {state !== 'loading' && (
          <Button asChild className="mt-6">
            <Link to="/profile">Open Weaver</Link>
          </Button>
        )}
      </div>
    </main>
  );
}
