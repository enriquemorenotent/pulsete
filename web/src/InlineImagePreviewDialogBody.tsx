import { DialogFooter } from './components/ui/dialog.js';
import { buildImageAltText } from './formatted-message-inline-images.js';

export function InlineImagePreviewDialogBody(props: { altText?: string; href: string }) {
  const altText = props.altText ?? buildImageAltText(props.href);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center bg-black/40 p-3 sm:p-4">
        <img
          src={props.href}
          alt={altText}
          decoding="async"
          referrerPolicy="no-referrer"
          className="block max-h-[calc(90dvh-5.5rem)] max-w-full object-contain"
        />
      </div>
      <DialogFooter className="shrink-0 border-t border-white/8 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="min-w-0 truncate text-sm text-muted-foreground">{altText}</span>
        <a
          href={props.href}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary underline decoration-primary/80 decoration-2 underline-offset-2 transition-colors hover:decoration-primary hover:opacity-85"
        >
          Open original
        </a>
      </DialogFooter>
    </div>
  );
}
