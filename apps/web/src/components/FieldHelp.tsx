import { useRef, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/** Optional field explanations available by hover, keyboard focus, or tap. */
export function FieldHelp({ label, children }: { label: string; children: string }) {
  const [open, setOpen] = useState(false);
  const openOnPointerDown = useRef(false);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`About ${label}`}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onPointerDown={() => {
              openOnPointerDown.current = open;
            }}
            onClick={(event) => {
              // Radix closes on pointer down; toggle from the state before that close.
              event.preventDefault();
              setOpen((current) => (event.detail === 0 ? !current : !openOnPointerDown.current));
            }}
          >
            <CircleHelp className="h-4 w-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-64 text-sm" side="top">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
