import type { BufferState } from '../../shared/protocol-chat.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';

type DeleteHistoryDialogProps = {
  buffer: BufferState | null;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  pending: boolean;
};

export function DeleteHistoryDialog(props: DeleteHistoryDialogProps) {
  return (
    <Dialog open={Boolean(props.buffer)} onOpenChange={(open) => !open && props.onCancel()}>
      <DialogContent className="sm:w-[min(calc(100vw-1rem),28rem)]">
        <DialogHeader>
          <DialogTitle>Delete PM history?</DialogTitle>
          <DialogDescription>{getDeleteHistoryDescription(props.buffer)}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={props.onCancel} disabled={props.pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={props.onConfirm} disabled={props.pending}>
            Delete history
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const getDeleteHistoryDescription = (buffer: BufferState | null) =>
  buffer
    ? `This deletes all saved messages with ${buffer.target}. The PM stays open.`
    : 'This deletes the saved messages for this private message. The PM stays open.';
