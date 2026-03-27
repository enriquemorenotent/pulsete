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
      <DialogContent className="max-h-[min(80vh,44rem)] max-w-[44rem] overflow-hidden">
        <DialogHeader className="space-y-1">
          <DialogTitle>Preferences</DialogTitle>
          <DialogDescription>
            Client-side app settings and assistant defaults.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto pr-1">
          <PreferencesDialogBody {...props} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={props.onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
