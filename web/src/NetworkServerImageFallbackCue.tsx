import { Cloud } from 'lucide-react';
import { cn } from '@/lib/utils.js';

type NetworkServerImageFallbackCueProps = {
  className?: string;
};

export function NetworkServerImageFallbackCue(
  props: NetworkServerImageFallbackCueProps,
) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute right-0.5 top-0.5 z-10 flex size-3.5 items-center justify-center rounded-full border border-black/60 bg-sky-300 text-zinc-950 shadow-[0_0_0_1px_rgba(255,255,255,0.24)]',
        props.className,
      )}
      data-network-image-source="irccloud-fallback"
      title="Using IRCCloud avatar fallback"
    >
      <Cloud className="size-2.5" />
    </span>
  );
}
