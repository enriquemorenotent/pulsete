import { PreferencesDialogBody, type PreferencesDialogBodyProps } from './PreferencesDialogBody.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';

export type PreferencesDialogProps = PreferencesDialogBodyProps & {
  open: boolean;
  onClose: () => void;
};

export function PreferencesDialog(props: PreferencesDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="h-[min(80dvh,44rem)] max-h-[80dvh] gap-0 overflow-hidden p-0 sm:w-[min(calc(100vw-1rem),44rem)]">
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="shrink-0 space-y-1 border-b border-white/6 px-4 py-4">
            <DialogTitle>Preferences</DialogTitle>
            <DialogDescription>
              Client-side app settings and assistant defaults.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <PreferencesDialogBody {...props} />
          </div>

          <DialogFooter className="shrink-0 border-t border-white/6 px-4 py-3">
            <Button variant="outline" onClick={props.onClose}>
              Close
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
