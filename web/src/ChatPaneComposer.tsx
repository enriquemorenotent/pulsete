import { SendHorizonal } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';

type ChatPaneComposerProps = {
  draft: string;
  placeholder: string;
  onDraftChange: (value: string) => void;
  onRecallOlderDraft: () => void;
  onRecallNewerDraft: () => void;
  onSend: () => Promise<void>;
};

export function ChatPaneComposer(props: ChatPaneComposerProps) {
  return (
    <footer className="shrink-0 border-t border-border bg-card px-3 py-2">
      <div className="flex gap-2">
        <Input
          value={props.draft}
          className="flex-1"
          onChange={(event) => props.onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' && !event.altKey && !event.ctrlKey && !event.metaKey) {
              event.preventDefault();
              props.onRecallOlderDraft();
              return;
            }
            if (event.key === 'ArrowDown' && !event.altKey && !event.ctrlKey && !event.metaKey) {
              event.preventDefault();
              props.onRecallNewerDraft();
              return;
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void props.onSend();
            }
          }}
          placeholder={props.placeholder}
        />
        <Button onClick={() => void props.onSend()}>
          <SendHorizonal />
          Send
        </Button>
      </div>
    </footer>
  );
}
