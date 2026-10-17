import type { ReactNode } from 'react';
import { Image, Video } from 'lucide-react';
import { environment, jamMeta } from './format';
import type { JamView } from './types';

interface JamCardProps {
  jam: JamView;
  actions?: ReactNode;
  children?: ReactNode;
}

export function JamCard({ jam, actions, children }: JamCardProps) {
  const env = environment(jam.systemInfo);
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-card p-3">
      <a
        href={jam.jamUrl}
        target="_blank"
        rel="noreferrer"
        className="block h-16 w-28 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
        aria-label="Open in Jam"
      >
        {jam.thumbnailUrl ? (
          // No referrer, so Jam's media host never sees Weaver page URLs.
          <img
            src={jam.thumbnailUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            {jam.type === 'screenshot' ? (
              <Image className="h-5 w-5" />
            ) : (
              <Video className="h-5 w-5" />
            )}
          </div>
        )}
      </a>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <a
            href={jam.jamUrl}
            target="_blank"
            rel="noreferrer"
            className="truncate text-sm font-medium text-foreground hover:underline"
          >
            {jam.title ?? 'Untitled Jam'}
          </a>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{jamMeta(jam)}</p>
        {env && <p className="truncate text-xs text-muted-foreground">{env}</p>}
        {jam.description && (
          <p className="mt-1 line-clamp-2 text-xs text-foreground/80">{jam.description}</p>
        )}
        {children}
      </div>
    </div>
  );
}
