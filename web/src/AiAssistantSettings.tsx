import { useId } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog.js';
import type { AiAssistantProviderStatus, AiAssistantSelection } from '../../shared/protocol-ai.js';
import { AiAssistantModelControls } from './AiAssistantModelControls.js';

type AiAssistantSettingsProps = {
  status: AiAssistantProviderStatus;
  selection: AiAssistantSelection;
  recentOnly: boolean;
  webLookup: boolean;
  onRecentOnlyChange: (value: boolean) => void;
  onWebLookupChange: (value: boolean) => void;
  onSelectionChange: (selection: AiAssistantSelection) => void;
  disabled: boolean;
};

export function AiAssistantSettings(props: AiAssistantSettingsProps) {
  const webLabel = useId();
  const recentLabel = useId();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className={`size-8 ${props.webLookup ? 'text-primary' : 'text-muted-foreground'}`}
          aria-label="Assistant settings" title={props.webLookup ? 'Assistant settings · Web lookup on' : 'Assistant settings'}>
          <SlidersHorizontal />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(calc(100vw-2rem),24rem)] gap-4">
        <div className="space-y-1">
          <DialogTitle>Assistant settings</DialogTitle>
          <DialogDescription>Choose what the assistant can look up.</DialogDescription>
        </div>
        <div className="space-y-3">
          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox className="mt-1" checked={props.recentOnly} disabled={props.disabled} aria-describedby={recentLabel}
              onCheckedChange={value => props.onRecentOnlyChange(value === true)} aria-label="Limit to recent chat" />
            <span>Limit to recent chat<span id={recentLabel} className="block text-xs leading-5 text-muted-foreground">
              When off, the assistant can look further back in the current chat as needed.
            </span></span>
          </label>
          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox className="mt-1" checked={props.webLookup} disabled={props.disabled} aria-describedby={webLabel}
              onCheckedChange={value => props.onWebLookupChange(value === true)} aria-label="Web lookup" />
            <span>Web lookup<span id={webLabel} className="block text-xs leading-5 text-muted-foreground">
              Allow short public searches for this assistant chat.
            </span></span>
          </label>
        </div>
        <AiAssistantModelControls disabled={props.disabled} onSelectionChange={props.onSelectionChange}
          savedSelection={props.selection} status={props.status} />
        <DialogClose asChild><Button type="button" variant="secondary" className="justify-self-end">Done</Button></DialogClose>
      </DialogContent>
    </Dialog>
  );
}
