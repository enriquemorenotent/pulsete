import { useState } from 'react';
import { accountMediaUrl } from './account-media.js';
import { cn } from '@/lib/utils.js';
import type { CommandPaletteEntry } from './command-palette.js';
import { NetworkServerImageFallbackCue } from './NetworkServerImageFallbackCue.js';
import { networkImageRuntimePhaseClass } from './network-image-state.js';

export function CommandPaletteEntryImage({ entry }: { entry: CommandPaletteEntry }) {
  const source = accountMediaUrl(entry.networkIconUrl, entry.mediaNetworkId);
  // A connection change retries pictures that were unavailable while offline.
  const url = source?.startsWith('/api/media/resource?')
    ? `${source}&accountRoute=${encodeURIComponent(entry.networkRuntimePhase ?? 'offline')}`
    : source;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = url && url !== failedUrl;
  const initials = entry.label.replace(/^[#&]+/, '').slice(0, 2).toUpperCase();

  return (
    <span className="relative inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-secondary text-xs font-semibold text-muted-foreground" aria-hidden="true">
      {showImage ? (
        <>
          <img
            src={url}
            onError={() => setFailedUrl(url)}
            alt=""
            className={cn('size-full object-cover', networkImageRuntimePhaseClass(entry.networkRuntimePhase))}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
          {entry.networkIconSource === 'irccloud-fallback' ? (
            <NetworkServerImageFallbackCue className="right-0 top-0" />
          ) : null}
        </>
      ) : initials}
    </span>
  );
}
