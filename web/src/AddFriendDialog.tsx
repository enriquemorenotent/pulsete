import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';

type AddFriendDialogKeyEvent = {
  key: string;
  nativeEvent: {
    isComposing?: boolean;
  };
};

export const shouldSubmitAddFriendDialog = (event: AddFriendDialogKeyEvent) =>
  event.key === 'Enter' && !event.nativeEvent.isComposing;

type AddFriendDialogProps = {
  open: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onOpenChange: (value: boolean) => void;
  onSubmit: () => Promise<void>;
};

export function AddFriendDialog(props: AddFriendDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[min(calc(100vw-1rem),28rem)]">
        <DialogHeader>
          <DialogTitle>Add Friend</DialogTitle>
          <DialogDescription>Save a nick for quick private-message access.</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={props.draft}
          placeholder="Nick"
          onChange={(event) => props.onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (!shouldSubmitAddFriendDialog(event)) {
              return;
            }
            event.preventDefault();
            void props.onSubmit();
          }}
        />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void props.onSubmit()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
