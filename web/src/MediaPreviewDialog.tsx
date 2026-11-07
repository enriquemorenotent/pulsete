import type { ComponentProps, ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog.js';
import { buildInlineMediaLabel, type InlineMedia } from './formatted-message-inline-media.js';
import { InlineMediaPreviewDialogBody } from './InlineMediaPreviewDialogBody.js';

type MediaPreviewDialogProps = {
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  media: InlineMedia | null;
  label?: string;
  description: string;
  networkId?: string;
  onCloseAutoFocus?: ComponentProps<typeof DialogContent>['onCloseAutoFocus'];
};

export function MediaPreviewDialog({ children, media, open, onOpenChange, label, description, networkId, onCloseAutoFocus }: MediaPreviewDialogProps) {
  return (
    <Dialog open={open && media !== null} onOpenChange={onOpenChange}>
      {children}
      {open && media ? (
        <DialogContent
          className="w-[min(calc(100vw-1rem),64rem)] max-h-[90dvh] gap-0 overflow-hidden p-0"
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <DialogTitle className="sr-only">{label ?? buildInlineMediaLabel(media)}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
          <InlineMediaPreviewDialogBody media={media} label={label} networkId={networkId} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function ImagePreviewDialog({ href, ...props }: Omit<MediaPreviewDialogProps, 'media'> & { href: string | null | undefined }) {
  return <MediaPreviewDialog {...props} media={href ? { kind: 'image', originalHref: href, sourceHref: href } : null} />;
}
