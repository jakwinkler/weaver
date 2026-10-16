import { Github } from 'lucide-react';
import { useSignInProviders } from '@/api';
import { API_BASE_URL } from '@/api/client';
import { Button } from '@/components/ui/button';

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M21.35 12.24c0-.69-.06-1.2-.2-1.73H12v3.32h5.37a4.65 4.65 0 0 1-2 3.05l-.02.11 2.9 2.24.2.02c1.84-1.7 2.9-4.2 2.9-7.01ZM12 21.75c2.63 0 4.83-.87 6.44-2.5l-3.07-2.37c-.82.55-1.94.94-3.37.94a5.85 5.85 0 0 1-5.54-4.04l-.1.01-3.02 2.34-.04.1A9.73 9.73 0 0 0 12 21.75ZM6.46 13.78A5.99 5.99 0 0 1 6.14 12c0-.62.11-1.22.3-1.78v-.12L3.4 7.72l-.1.05A9.77 9.77 0 0 0 2.25 12c0 1.52.36 2.96 1.05 4.23l3.16-2.45ZM12 6.18c1.83 0 3.06.79 3.76 1.44l2.75-2.68A9.36 9.36 0 0 0 12 2.25a9.73 9.73 0 0 0-8.7 5.52l3.14 2.45A5.87 5.87 0 0 1 12 6.18Z"
      />
    </svg>
  );
}

/**
 * Google and GitHub both sign in existing accounts and create new ones, so the buttons say
 * "Continue" on the sign-in and sign-up pages alike. Unconfigured providers are hidden; if
 * the server can't be asked, both stay visible as before.
 */
export function SocialSignInButtons({ hint, divider }: { hint: string; divider: string }) {
  const providers = useSignInProviders();
  if (providers.isLoading) return null;
  const google = providers.data?.google ?? true;
  const github = providers.data?.github ?? true;
  if (!google && !github) return null;

  return (
    <>
      <div className="mb-5 grid gap-3">
        {google && (
          <Button asChild variant="outline" className="w-full">
            <a href={`${API_BASE_URL}/auth/google`}>
              <GoogleMark />
              Continue with Google
            </a>
          </Button>
        )}
        {github && (
          <Button asChild variant="outline" className="w-full">
            <a href={`${API_BASE_URL}/auth/github`}>
              <Github aria-hidden="true" />
              Continue with GitHub
            </a>
          </Button>
        )}
        <p className="text-center text-xs text-muted-foreground">{hint}</p>
      </div>

      <div className="mb-5 flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {divider}
        <span className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}
