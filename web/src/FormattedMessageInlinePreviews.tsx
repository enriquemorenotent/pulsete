import { memo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog.js';
import { buildImageAltText } from './formatted-message-inline-images.js';
import { InlineImagePreviewDialogBody } from './InlineImagePreviewDialogBody.js';

export const FormattedMessageInlinePreviews = memo(function FormattedMessageInlinePreviews(
  props: { hrefs: string[]; onInlinePreviewLoad?: () => void },
) {
  const [activeHref, setActiveHref] = useState<string | null>(null);

  if (props.hrefs.length === 0) {
    return null;
  }

  return (
    <Dialog open={activeHref !== null} onOpenChange={(open) => !open && setActiveHref(null)}>
      <span className="mt-2 flex flex-wrap gap-2">
        {props.hrefs.map((href) => (
          <button
            key={href}
            type="button"
            onClick={() => setActiveHref(href)}
            className="block max-w-full cursor-zoom-in overflow-hidden rounded-sm border border-border/80 bg-card/70 p-1 transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            <img
              src={href}
              alt={buildImageAltText(href)}
              loading="lazy"
              decoding="async"
              onError={props.onInlinePreviewLoad}
              onLoad={props.onInlinePreviewLoad}
              referrerPolicy="no-referrer"
              className="block max-h-80 max-w-full rounded-sm object-contain"
            />
          </button>
        ))}
      </span>
      {activeHref ? (
        <DialogContent className="w-[min(calc(100vw-1rem),64rem)] max-h-[90dvh] gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">{buildImageAltText(activeHref)}</DialogTitle>
          <DialogDescription className="sr-only">Expanded inline image preview.</DialogDescription>
          <InlineImagePreviewDialogBody href={activeHref} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
});
