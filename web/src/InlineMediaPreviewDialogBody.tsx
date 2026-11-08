import { ExternalLink } from './ExternalLink.js';
import { useAccountMediaUrl } from './account-media.js';
import { DialogFooter } from './components/ui/dialog.js';
import {
  buildInlineMediaLabel,
  type InlineMedia,
} from './formatted-message-inline-media.js';

export function InlineMediaPreviewDialogBody(props: { label?: string; media: InlineMedia; networkId?: string }) {
  const { media } = props;
  const source = useAccountMediaUrl(media.sourceHref, props.networkId);
  const label = props.label ?? buildInlineMediaLabel(media);
  const loopingAnimation = media.kind === 'video' && media.playback === 'looping-animation';

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-black/40 p-3 sm:p-4">
        {media.kind === 'image' ? (
          <img
            src={source}
            alt={label}
            decoding="async"
            referrerPolicy="no-referrer"
            className="block max-h-[calc(90dvh-5.5rem)] max-w-full object-contain"
          />
        ) : (
          <video
            src={source}
            aria-label={label}
            autoPlay={loopingAnimation}
            controls
            loop={loopingAnimation}
            muted
            playsInline
            preload="metadata"
            className="block max-h-[calc(90dvh-5.5rem)] max-w-full object-contain"
          />
        )}
      </div>
      <DialogFooter className="min-w-0 shrink-0 border-t border-white/8 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <span title={label} className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{label}</span>
        <ExternalLink
          href={media.originalHref}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 whitespace-nowrap font-medium text-primary underline decoration-primary/80 decoration-2 underline-offset-2 transition-colors hover:decoration-primary hover:opacity-85"
        >
          Open original
        </ExternalLink>
      </DialogFooter>
    </div>
  );
}
