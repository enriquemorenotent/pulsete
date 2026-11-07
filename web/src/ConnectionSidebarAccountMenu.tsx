import { useRef, useState } from 'react';
import { Check, Copy, Ellipsis, ImageIcon, X } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog.js';
import { InlineImagePreviewDialogBody } from './InlineImagePreviewDialogBody.js';

export function ConnectionSidebarAccountMenu(props: {
  name: string;
  imageUrl?: string;
  onClose: () => void;
}) {
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const imageLabel = `Profile picture for ${props.name}`;
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copyImageUrl = async () => {
    if (!props.imageUrl) return;
    try {
      await navigator.clipboard.writeText(props.imageUrl);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  };

  return (
    <Dialog open={previewOpen && !!props.imageUrl} onOpenChange={setPreviewOpen}>
      <DropdownMenu.Root onOpenChange={() => setCopyStatus('idle')}>
        <DropdownMenu.Trigger asChild>
          <button
            ref={menuButtonRef}
            type="button"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-white/5 hover:text-foreground focus-visible:ring-1 focus-visible:ring-primary/45 data-[state=open]:bg-white/5"
            aria-label={`Account actions for ${props.name}`}
            title="Account actions"
          >
            <Ellipsis className="size-4" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            onCloseAutoFocus={(event) => { if (previewOpen) event.preventDefault(); }}
            align="end"
            sideOffset={6}
            collisionPadding={8}
            className="z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
          >
            {props.imageUrl ? (
              <>
                <DropdownMenu.Item className={menuItemClass} onSelect={() => setPreviewOpen(true)}>
                  <ImageIcon className="size-3.5" />
                  View profile picture
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={menuItemClass}
                  aria-label="Copy image URL"
                  onSelect={(event) => {
                    event.preventDefault();
                    void copyImageUrl();
                  }}
                >
                  {copyStatus === 'copied' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  <span role="status">{copyStatus === 'copied' ? 'Image URL copied' : copyStatus === 'failed' ? 'Copy failed — retry' : 'Copy image URL'}</span>
                </DropdownMenu.Item>
              </>
            ) : null}
            <DropdownMenu.Item className={menuItemClass} onSelect={props.onClose}>
              <X className="size-3.5" />
              Close account
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {previewOpen && props.imageUrl ? (
        <DialogContent
          className="w-[min(calc(100vw-1rem),64rem)] max-h-[90dvh] gap-0 overflow-hidden p-0"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            menuButtonRef.current?.focus();
          }}
        >
          <DialogTitle className="sr-only">{imageLabel}</DialogTitle>
          <DialogDescription className="sr-only">Full-size account profile picture.</DialogDescription>
          <InlineImagePreviewDialogBody href={props.imageUrl} altText={imageLabel} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

const menuItemClass = 'flex cursor-default select-none items-center gap-2 rounded-md px-2.5 py-2 text-xs outline-none data-[highlighted]:bg-white/7';
