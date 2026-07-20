import { Maximize2 } from 'lucide-react';
import { memo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog.js';
import {
  buildInlineMediaLabel,
  type InlineMedia,
} from './formatted-message-inline-media.js';
import { InlineMediaPreviewDialogBody } from './InlineMediaPreviewDialogBody.js';

export const FormattedMessageInlinePreviews = memo(function FormattedMessageInlinePreviews(
  props: { media: InlineMedia[]; onInlinePreviewLoad?: () => void },
) {
  const [activeHref, setActiveHref] = useState<string | null>(null);
  const activeMedia = props.media.find((media) => media.originalHref === activeHref) ?? null;

  if (props.media.length === 0) {
    return null;
  }

  return (
    <Dialog open={activeMedia !== null} onOpenChange={(open) => !open && setActiveHref(null)}>
      <span className="mt-2 flex flex-wrap gap-2">
        {props.media.map((media) => (
          <InlineMediaPreviewTile
            key={media.originalHref}
            media={media}
            onActivate={() => setActiveHref(media.originalHref)}
            onLoad={props.onInlinePreviewLoad}
          />
        ))}
      </span>
      {activeMedia ? (
        <DialogContent className="w-[min(calc(100vw-1rem),64rem)] max-h-[90dvh] gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">{buildInlineMediaLabel(activeMedia)}</DialogTitle>
          <DialogDescription className="sr-only">
            Expanded inline {activeMedia.kind} preview.
          </DialogDescription>
          <InlineMediaPreviewDialogBody media={activeMedia} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
});

function InlineMediaPreviewTile(props: {
  media: InlineMedia;
  onActivate: () => void;
  onLoad?: () => void;
}) {
  const label = buildInlineMediaLabel(props.media);
  if (props.media.kind === 'video' && props.media.playback === 'on-demand') {
    return (
      <span className="relative block max-w-full overflow-hidden rounded-sm border border-border/80 bg-card/70 p-1">
        <InlineMediaThumbnail media={props.media} onLoad={props.onLoad} />
        <button
          type="button"
          aria-label={`Expand ${label}`}
          title="Expand video"
          onClick={props.onActivate}
          className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-sm border border-white/20 bg-black/70 text-white shadow-sm transition-colors hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
        >
          <Maximize2 aria-hidden="true" className="size-3.5" />
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      onClick={props.onActivate}
      className="block max-w-full cursor-zoom-in overflow-hidden rounded-sm border border-border/80 bg-card/70 p-1 transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
    >
      <InlineMediaThumbnail media={props.media} onLoad={props.onLoad} />
    </button>
  );
}

function InlineMediaThumbnail(props: { media: InlineMedia; onLoad?: () => void }) {
  const { media } = props;
  if (media.kind === 'image') {
    return (
      <img
        src={media.sourceHref}
        alt={buildInlineMediaLabel(media)}
        loading="lazy"
        decoding="async"
        onError={props.onLoad}
        onLoad={props.onLoad}
        referrerPolicy="no-referrer"
        className="block max-h-80 max-w-full rounded-sm object-contain"
      />
    );
  }
  const loopingAnimation = media.playback === 'looping-animation';
  return (
    <video
      src={media.sourceHref}
      aria-hidden={loopingAnimation ? 'true' : undefined}
      aria-label={loopingAnimation ? undefined : buildInlineMediaLabel(media)}
      autoPlay={loopingAnimation}
      controls={!loopingAnimation}
      loop={loopingAnimation}
      muted
      playsInline
      preload="metadata"
      onError={props.onLoad}
      onLoadedMetadata={props.onLoad}
      className={`${loopingAnimation ? 'pointer-events-none ' : ''}block max-h-80 max-w-full rounded-sm object-contain`}
    />
  );
}
