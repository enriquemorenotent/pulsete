import { useId, useMemo, useState, type ChangeEvent } from 'react';
import { Cloud, ImageIcon, ImagePlus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { InlineImagePreviewDialogBody } from './InlineImagePreviewDialogBody.js';
import { NetworkServerImageCropDialog } from './NetworkServerImageCropDialog.js';
import { resolveIrcCloudAvatarUrl } from './user-avatars/irccloud.js';
import { readSelectedImageDataUrl } from './user-avatars/image-selection.js';
import { useQueryAvatarOverride } from './user-avatars/query-overrides.js';
import { resolveUserAvatarTarget } from './user-avatars/override-model.js';
import type { ChannelUserState } from '../../shared/protocol-chat.js';

export type QueryProfileAvatarUser = Pick<
  ChannelUserState,
  'account' | 'host' | 'identity' | 'nick' | 'username'
> & { ircCloudAvatarId?: string | null };

type QueryProfileAvatarBannerProps = {
  bufferId: string;
  customAvatarUrl?: string | null;
  enabled: boolean;
  networkId: string;
  onSetCustomAvatarUrl?: (url: string | null) => void;
  user: QueryProfileAvatarUser | null | undefined;
};

const failedQueryAvatarUrls = new Set<string>();

export function QueryProfileAvatarBanner(props: QueryProfileAvatarBannerProps) {
  const inputId = useId();
  const avatarTarget = useMemo(
    () => (props.user ? resolveUserAvatarTarget(props.networkId, props.user) : null),
    [props.networkId, props.user],
  );
  const override = useQueryAvatarOverride({
    allowNickFallback: true,
    bufferId: props.bufferId,
    target: avatarTarget,
  });
  const customAvatarUrl = props.customAvatarUrl === undefined
    ? override.url
    : props.customAvatarUrl;
  const setCustomAvatarUrl = props.onSetCustomAvatarUrl ?? override.setUrl;
  const realUrl = useMemo(
    () => (props.enabled && props.user ? resolveIrcCloudAvatarUrl(props.user) : null),
    [props.enabled, props.user],
  );
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  if (!props.user) {
    return null;
  }

  const sourceUrl = customAvatarUrl || realUrl;
  const source = customAvatarUrl ? 'custom' : realUrl ? 'irccloud' : 'placeholder';
  const showInitial = !sourceUrl || failedUrl === sourceUrl || failedQueryAvatarUrls.has(sourceUrl);
  const altText = source === 'custom'
    ? `Custom avatar for ${props.user.nick}`
    : `Avatar for ${props.user.nick}`;

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) {
      return;
    }
    try {
      setCropSource(await readSelectedImageDataUrl(file));
      setError(null);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : 'Image could not be read.');
    }
  };

  return (
    <div className="group relative">
      {showInitial ? (
        <div
          aria-hidden="true"
          className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-sm border border-white/10 bg-secondary text-5xl text-muted-foreground"
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
            className="block w-full cursor-zoom-in overflow-hidden rounded-sm border border-white/10 bg-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            onClick={() => setPreviewOpen(true)}
          >
            <img
              src={sourceUrl}
              alt=""
              className="block h-auto w-full object-contain"
              referrerPolicy="no-referrer"
              loading="lazy"
              decoding="async"
              onError={() => {
                failedQueryAvatarUrls.add(sourceUrl);
                setFailedUrl(sourceUrl);
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
      <AvatarSourceCue source={source} />
      <div className="absolute bottom-2 right-2 z-20 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <input id={inputId} type="file" accept="image/*" className="sr-only" onChange={handleFileChange} />
        <Button asChild variant="secondary" size="icon" title="Choose custom avatar" className="size-7">
          <label htmlFor={inputId} className="cursor-pointer">
            <ImagePlus className="size-3.5" aria-hidden />
          </label>
        </Button>
        {customAvatarUrl ? (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            title="Use original avatar"
            className="size-7"
            onClick={() => {
              setError(null);
              setCustomAvatarUrl(null);
            }}
          >
            <RotateCcw className="size-3.5" aria-hidden />
          </Button>
        ) : null}
      </div>
      {error ? <div className="mt-1 px-1 text-[12px] text-destructive">{error}</div> : null}
      {cropSource ? (
        <NetworkServerImageCropDialog
          source={cropSource}
          title="Crop Avatar"
          onCancel={() => setCropSource(null)}
          onConfirm={(value) => {
            setCropSource(null);
            setCustomAvatarUrl(value);
          }}
        />
      ) : null}
    </div>
  );
}

function AvatarSourceCue(props: { source: 'custom' | 'irccloud' | 'placeholder' }) {
  if (props.source === 'placeholder') {
    return null;
  }
  const Icon = props.source === 'custom' ? ImageIcon : Cloud;
  const title = props.source === 'custom' ? 'Custom avatar' : 'IRCCloud avatar';
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute right-2 top-2 z-10 flex size-6 items-center justify-center rounded-full border border-black/60 bg-sky-300 text-zinc-950 shadow-[0_0_0_1px_rgba(255,255,255,0.24)]"
      title={title}
    >
      <Icon className="size-3.5" />
    </span>
  );
}

const resolveAvatarInitial = (nick: string) => {
  const initial = nick.trim().charAt(0);
  return initial ? initial.toUpperCase() : '?';
};
