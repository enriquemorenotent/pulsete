import { useMemo, useState } from 'react';
import type { ChannelUserState } from '../../../shared/protocol-chat.js';
import { cn } from '@/lib/utils.js';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog.js';
import { InlineImagePreviewDialogBody } from '../InlineImagePreviewDialogBody.js';
import { resolveIrcCloudAvatarUrl } from './irccloud.js';
import {
  useUserAvatarOverrideUrl,
  type UserAvatarOverrideTarget,
} from './query-overrides.js';

const failedAvatarUrls = new Set<string>();

type UserAvatarProps = {
  className?: string;
  customAvatarAllowNickFallback?: boolean;
  customAvatarTarget?: UserAvatarOverrideTarget | null;
  customAvatarUrl?: string | null;
  enabled: boolean;
  placeholder?: 'initial' | 'none';
  preview?: boolean;
  shape?: 'circle' | 'square';
  size?: 'lg' | 'md' | 'sm';
  user: (Pick<ChannelUserState, 'account' | 'host' | 'identity' | 'nick' | 'username'> & {
    ircCloudAvatarId?: string | null;
  }) | null | undefined;
};

const avatarSizeClassName = {
  lg: 'size-[68px] text-lg',
  md: 'size-9 text-sm',
  sm: 'size-5 text-[10px]',
} as const;

const avatarShapeClassName = {
  circle: 'rounded-full',
  square: 'rounded-none',
} as const;

export function UserAvatar({
  className,
  customAvatarAllowNickFallback = false,
  customAvatarTarget = null,
  customAvatarUrl,
  enabled,
  placeholder = 'none',
  preview = false,
  shape = 'circle',
  size = 'sm',
  user,
}: UserAvatarProps) {
  const storedCustomAvatarUrl = useUserAvatarOverrideUrl(customAvatarTarget, {
    allowNickFallback: customAvatarAllowNickFallback,
  });
  const resolvedCustomAvatarUrl = customAvatarUrl === undefined
    ? storedCustomAvatarUrl
    : customAvatarUrl?.trim() || null;
  const externalUrl = useMemo(
    () => (enabled && user ? resolveIrcCloudAvatarUrl(user) : null),
    [enabled, user],
  );
  const url = resolvedCustomAvatarUrl || externalUrl;
  const [failedUrl, setFailedUrl] = useState<string | null>(() =>
    url && failedAvatarUrls.has(url) ? url : null);
  const [previewOpen, setPreviewOpen] = useState(false);

  if (!user || (!enabled && !resolvedCustomAvatarUrl)) {
    return null;
  }

  const showInitial = !url || failedUrl === url || failedAvatarUrls.has(url);
  if (!url && placeholder === 'none') {
    return null;
  }

  const altText = `Avatar for ${user.nick}`;
  const avatar = (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden bg-secondary text-muted-foreground',
        avatarSizeClassName[size],
        avatarShapeClassName[shape],
        className,
      )}
      aria-hidden="true"
    >
      {showInitial ? (
        <span className="font-medium leading-none">
          {resolveAvatarInitial(user.nick)}
        </span>
      ) : (
        <img
          src={url}
          alt=""
          className={cn('size-full object-cover', avatarShapeClassName[shape])}
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          onError={() => {
            failedAvatarUrls.add(url);
            setFailedUrl(url);
          }}
        />
      )}
    </span>
  );

  if (!preview || showInitial || !url) {
    return avatar;
  }

  return (
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
      <button
        type="button"
        aria-label={altText}
        className={cn(
          'inline-flex shrink-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70',
          avatarShapeClassName[shape],
        )}
        onClick={() => setPreviewOpen(true)}
      >
        {avatar}
      </button>
      {previewOpen ? (
        <DialogContent className="w-[min(calc(100vw-1rem),64rem)] max-h-[90dvh] gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">{altText}</DialogTitle>
          <DialogDescription className="sr-only">Expanded avatar preview.</DialogDescription>
          <InlineImagePreviewDialogBody href={url} altText={altText} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

const resolveAvatarInitial = (nick: string) => {
  const initial = nick.trim().charAt(0);
  return initial ? initial.toUpperCase() : '?';
};
