import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { InlineImagePreviewDialogBody } from './InlineImagePreviewDialogBody.js';
import { failedAvatarUrls } from './user-avatars/failure-cache.js';
import { resolveIrcCloudAvatarUrl } from './user-avatars/irccloud.js';
import { useQueryAvatarOverride } from './user-avatars/query-overrides.js';
import { resolveUserAvatarTarget } from './user-avatars/override-model.js';
import type { ChannelUserState } from '../../shared/protocol-chat.js';

export type QueryProfileAvatarUser = Pick<
  ChannelUserState,
  'account' | 'host' | 'identity' | 'nick' | 'username'
> & { ircCloudAvatarId?: string | null };

type QueryProfileAvatarBannerProps = {
  customAvatarUrl?: string | null;
  enabled: boolean;
  networkId: string;
  onSourceError?: (sourceUrl: string) => void;
  user: QueryProfileAvatarUser | null | undefined;
  variant?: 'banner' | 'compact' | 'topbar';
};

export function QueryProfileAvatarBanner(props: QueryProfileAvatarBannerProps) {
  const compact = props.variant === 'compact';
  const topbar = props.variant === 'topbar';
  const avatarTarget = useMemo(
    () => (props.user ? resolveUserAvatarTarget(props.networkId, props.user) : null),
    [props.networkId, props.user],
  );
  const override = useQueryAvatarOverride({
    allowNickFallback: true,
    target: avatarTarget,
  });
  const customAvatarUrl = props.customAvatarUrl === undefined
    ? override.url
    : props.customAvatarUrl;
  const realUrl = useMemo(
    () => (props.enabled && props.user ? resolveIrcCloudAvatarUrl(props.user) : null),
    [props.enabled, props.user],
  );
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  if (!props.user) {
    return null;
  }

  const sourceUrl = customAvatarUrl || realUrl;
  const showInitial = !sourceUrl || failedUrl === sourceUrl || failedAvatarUrls.has(sourceUrl);
  const altText = customAvatarUrl
    ? `Custom avatar for ${props.user.nick}`
    : `Avatar for ${props.user.nick}`;

  return (
    <div className={cn(
      'relative',
      compact && 'size-12 shrink-0',
      topbar && 'size-15 shrink-0',
    )}>
      {showInitial ? (
        <div
          aria-hidden="true"
          className={cn(
            'flex items-center justify-center overflow-hidden bg-secondary text-muted-foreground',
            compact && 'size-12 rounded-xl border border-white/10 text-base',
            topbar && 'size-15 text-xl',
            !compact && !topbar && 'aspect-square w-full rounded-sm border border-white/10 text-5xl',
          )}
        >
          <span className="font-medium leading-none">
            {resolveAvatarInitial(props.user.nick)}
          </span>
        </div>
      ) : (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <button
            type="button"
            aria-label={altText}
            className={cn(
              'block cursor-zoom-in overflow-hidden bg-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70',
              compact && 'size-12 rounded-xl border border-white/10',
              topbar && 'size-15',
              !compact && !topbar && 'w-full rounded-sm border border-white/10',
            )}
            onClick={() => setPreviewOpen(true)}
          >
            <img
              src={sourceUrl}
              alt=""
              className={cn(
                'block w-full',
                (compact || topbar) ? 'size-full object-cover' : 'h-auto object-contain',
              )}
              referrerPolicy="no-referrer"
              loading="lazy"
              decoding="async"
              onError={() => {
                failedAvatarUrls.add(sourceUrl);
                setFailedUrl(sourceUrl);
                props.onSourceError?.(sourceUrl);
              }}
            />
          </button>
          {previewOpen ? (
            <DialogContent className="w-[min(calc(100vw-1rem),64rem)] max-h-[90dvh] gap-0 overflow-hidden p-0">
              <DialogTitle className="sr-only">{altText}</DialogTitle>
              <DialogDescription className="sr-only">Expanded avatar preview.</DialogDescription>
              <InlineImagePreviewDialogBody href={sourceUrl} altText={altText} />
            </DialogContent>
          ) : null}
        </Dialog>
      )}
    </div>
  );
}

const resolveAvatarInitial = (nick: string) => {
  const initial = nick.trim().charAt(0);
  return initial ? initial.toUpperCase() : '?';
};
