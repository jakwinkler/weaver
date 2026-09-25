import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '@/api/client';
import { useAuthStore } from '@/stores';
import type { User } from '@weaver/shared';

interface AuthSession {
  user: User & { role: string };
  tenantId: string;
}

export function OAuthCallback() {
  const navigate = useNavigate();
  const restoreSession = useAuthStore((state) => state.restoreSession);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void apiClient
      .get<AuthSession>('/auth/session')
      .then(({ data }) => {
        if (!active) return;
        restoreSession(data.user, data.tenantId);
        navigate('/projects', { replace: true });
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [restoreSession, navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/50 px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">
          {failed ? 'Sign-in could not be completed' : 'Completing sign-in…'}
        </h1>
        {failed && (
          <p className="mt-3 text-sm text-muted-foreground">
            Your sign-in session may have expired.{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Return to sign in
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
