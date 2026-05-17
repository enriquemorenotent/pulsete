import { Server } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { networkImageRuntimeClass } from './network-image-state.js';
import type { NetworkRuntimeState } from './workspace.js';

type ConnectionSidebarServerIconProps = {
  className?: string;
  iconUrl?: string | null;
  imageClassName?: string;
  runtime: NetworkRuntimeState | null;
};

export function ConnectionSidebarServerIcon(
  props: ConnectionSidebarServerIconProps,
) {
  if (props.iconUrl) {
    return (
      <img
        src={props.iconUrl}
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
