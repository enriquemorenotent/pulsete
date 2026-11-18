import { useState } from 'react';
import { ArrowUpRight, Image, Link2, Play } from 'lucide-react';
import type { AiAssistantAttachment } from '../../shared/protocol-ai.js';
import { DialogTrigger } from './components/ui/dialog.js';
import { Button } from './components/ui/button.js';
import { ExternalLink } from './ExternalLink.js';
import { MediaPreviewDialog } from './MediaPreviewDialog.js';
import { useAccountMediaUrl } from './account-media.js';
import { resolveInlineMediaHref } from './formatted-message-inline-media.js';
import { usePagePreviewMedia } from './page-preview-media.js';

export function AiAssistantMedia({ attachments, showMedia }: {
  attachments: readonly AiAssistantAttachment[];
  showMedia: boolean;
}) {
  return (
    <ul aria-label="Reply media" className="mt-2.5 grid max-w-xl gap-2">
      {attachments.map(attachment => (
        <MediaCard key={`${showMedia}:${attachment.url}`} attachment={attachment} showMedia={showMedia} />
      ))}
    </ul>
  );
}

function MediaCard({ attachment, showMedia }: { attachment: AiAssistantAttachment; showMedia: boolean }) {
  const { kind, title, url } = attachment;
  const destination = URL.parse(url);
  const host = destination && ['http:', 'https:'].includes(destination.protocol) ? destination.hostname : null;
  const direct = resolveInlineMediaHref(url);
  const [revealed, setRevealed] = useState(false);
  const [failedUrls, setFailedUrls] = useState<ReadonlySet<string>>(() => new Set());
  const directUrl = useAccountMediaUrl(direct?.sourceHref);
  const directPreview = directUrl && !failedUrls.has(directUrl) ? direct : null;
  const showPreview = showMedia || revealed;
  const [pagePreview] = usePagePreviewMedia(showPreview && host && !directPreview ? [url] : []);
  const media = showPreview ? directPreview ?? pagePreview : undefined;
  const mediaUrl = useAccountMediaUrl(media?.sourceHref);
  const [open, setOpen] = useState(false);
  const preview = media && mediaUrl && !failedUrls.has(mediaUrl) ? media : null;
  const onPreviewError = () => {
    if (mediaUrl) setFailedUrls(previous => new Set(previous).add(mediaUrl));
  };
  if (!host) return null;
  const Icon = kind === 'video' ? Play : kind === 'image' ? Image : Link2;

  const pageTitle = pagePreview?.kind === 'image' ? pagePreview.label : undefined;
  const imageLabel = kind === 'image' ? title : pageTitle ?? `Preview of ${title}`;

  return (
    <li className="min-w-0 overflow-hidden rounded-lg border border-border bg-muted/25">
      {preview?.kind === 'image' ? (
        <MediaPreviewDialog media={preview} open={open} onOpenChange={setOpen} label={imageLabel} description="Image from the assistant’s reply">
          <DialogTrigger asChild>
            <button type="button" aria-label={`Enlarge ${imageLabel}`}
              className="block w-full cursor-zoom-in bg-black/20 focus-visible:outline focus-visible:outline-offset-[-2px] focus-visible:outline-primary">
              <img src={mediaUrl} alt={imageLabel} loading="lazy" decoding="async"
                className="mx-auto max-h-52 w-full object-contain" onError={onPreviewError} />
            </button>
          </DialogTrigger>
        </MediaPreviewDialog>
      ) : preview?.kind === 'video' ? (
        <video src={mediaUrl} aria-label={title} controls preload="none" playsInline
          className="max-h-52 w-full bg-black/20" onError={onPreviewError} />
      ) : null}
      <ExternalLink href={url} target="_blank" rel="noopener noreferrer"
        className="flex min-w-0 items-center gap-2.5 px-3 py-2 hover:bg-muted/60 focus-visible:outline focus-visible:outline-offset-[-2px] focus-visible:outline-primary">
        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium wrap-anywhere">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{host}</span>
        </span>
        <ArrowUpRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </ExternalLink>
      {!showMedia && kind !== 'link' ? (
        <div className="border-t border-border px-3 py-1.5">
          <Button type="button" variant="outline" size="sm" aria-pressed={revealed}
            onClick={() => { setRevealed(!revealed); setOpen(false); }}>
            Show {kind === 'image' ? 'image' : 'video'} preview
          </Button>
        </div>
      ) : null}
    </li>
  );
}
