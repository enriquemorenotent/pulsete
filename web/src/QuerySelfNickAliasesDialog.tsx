import { useEffect, useState } from 'react';
import type { BufferSelfNickAliasesRequest } from '../../shared/protocol.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import {
  formatCommaSeparatedNicks,
  parseCommaSeparatedNicks,
  SelfNickAliasesField,
} from './self-nick-aliases.js';

type QuerySelfNickAliasesDialogProps = {
  open: boolean;
  targetLabel: string;
  currentAliases: string[];
  onClose: () => void;
  onSave: (input: BufferSelfNickAliasesRequest) => Promise<boolean>;
};

export function QuerySelfNickAliasesDialog(props: QuerySelfNickAliasesDialogProps) {
  const [value, setValue] = useState(() => formatCommaSeparatedNicks(props.currentAliases));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (props.open) {
      setValue(formatCommaSeparatedNicks(props.currentAliases));
      setSubmitting(false);
    }
  }, [props.currentAliases, props.open]);

  const handleSave = async () => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    const saved = await props.onSave({
      selfNickAliases: parseCommaSeparatedNicks(value),
    });
    setSubmitting(false);
    if (saved) {
      props.onClose();
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && !submitting && props.onClose()}>
      <DialogContent className="w-[min(calc(100vw-1rem),28rem)]">
        <DialogHeader>
          <DialogTitle>Self aliases</DialogTitle>
          <DialogDescription>
            Repair old imported lines in {props.targetLabel} by marking older nicknames as yours.
          </DialogDescription>
        </DialogHeader>

        <SelfNickAliasesField
          id="query-self-nick-aliases"
          label="Old self nicks"
          value={value}
          disabled={submitting}
          placeholder="comma-separated, e.g. sofiaIsBack, oldsofia"
          hint="These aliases apply only to this private chat and only to imported or repaired history."
          onChange={setValue}
        />

        <DialogFooter>
          <Button variant="outline" type="button" disabled={submitting} onClick={props.onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={submitting} onClick={handleSave}>
            {submitting ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
