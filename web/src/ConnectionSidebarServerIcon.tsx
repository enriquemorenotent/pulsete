import { useAccountMediaUrl } from './account-media.js';
import { useState } from 'react';
import { Server } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { networkImageRuntimeClass } from './network-image-state.js';
import type { NetworkRuntimeState } from './workspace.js';

type ConnectionSidebarServerIconProps = {
  networkId?: string;
  className?: string;
  iconUrl?: string | null;
  imageClassName?: string;
  fallbackLabel?: string;
  runtime: NetworkRuntimeState | null;
};

export function ConnectionSidebarServerIcon(
  props: ConnectionSidebarServerIconProps,
) {
  const mediaUrl = useAccountMediaUrl(props.iconUrl, props.networkId);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (mediaUrl && mediaUrl !== failedUrl) {
    return (
      <img
        src={mediaUrl}
        onError={() => setFailedUrl(mediaUrl ?? null)}
        alt=""
        className={cn(
          'shrink-0 rounded-sm object-cover',
          networkImageRuntimeClass(props.runtime),
          props.className,
          props.imageClassName,
        )}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />
    );
  }

  if (props.fallbackLabel) {
    return <span aria-hidden>{props.fallbackLabel}</span>;
  }

  return (
    <Server
      aria-hidden
      className={cn(
        'shrink-0',
        serverIconTone(props.runtime),
        props.className,
      )}
    />
  );
}

export const serverIconTone = (runtime: NetworkRuntimeState | null) => {
  if (runtime?.phase === 'connected') {
    return 'text-emerald-400';
  }
  if (runtime?.phase === 'connecting') {
    return 'text-amber-300';
  }
  return 'text-zinc-500';
};
