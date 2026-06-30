import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { BufferState } from '../../shared/protocol-chat.js';
import type { AiAssistantMode, AiAssistantProviderStatus } from '../../shared/protocol-ai.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { aiAssistantApi } from './ai-assistant-client.js';

type AiAssistantDialogProps = {
  buffer: BufferState | null;
  onOpenChange: (open: boolean) => void;
  onUseSuggestion: (value: string) => void;
  open: boolean;
};

export function AiAssistantDialog(props: AiAssistantDialogProps) {
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [responseMode, setResponseMode] = useState<AiAssistantMode>('answer');
  const [status, setStatus] = useState<AiAssistantProviderStatus | null>(null);

  useEffect(() => {
    if (!props.open) {
      return;
    }
    setAnswer('');
    setError('');
    setResponseMode('answer');
    void aiAssistantApi.status().then(setStatus, (reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Unable to load assistant status');
    });
  }, [props.buffer?.id, props.open]);

  const ask = async (mode: AiAssistantMode) => {
    if (!props.buffer) {
      return;
    }
    setPending(true);
    setError('');
    setResponseMode(mode);
    try {
      const response = await aiAssistantApi.ask(props.buffer.id, { mode, prompt });
      setAnswer(response.answer);
      setStatus(response.status);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Assistant request failed');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:w-[min(calc(100vw-1rem),40rem)]">
        <DialogHeader>
          <DialogTitle>Assistant</DialogTitle>
          <DialogDescription>{props.buffer ? props.buffer.target : 'Conversation'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <AssistantStatus status={status} error={error} />
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask about this conversation..."
            className="min-h-28 w-full resize-none rounded-sm border border-white/[0.055] bg-white/[0.018] px-2.5 py-2 text-[13px] leading-5 text-foreground/84 outline-none transition-colors placeholder:text-muted-foreground/54 focus-visible:border-ring/60 focus-visible:bg-white/[0.032] focus-visible:ring-1 focus-visible:ring-ring/35"
          />
          <AssistantAnswer answer={answer} />
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => answer && props.onUseSuggestion(answer)}
            disabled={!answer || responseMode !== 'suggest-reply'}
          >
            Use as draft
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void ask('suggest-reply')} disabled={pending}>
              <Sparkles />
              Suggest reply
            </Button>
            <Button onClick={() => void ask('answer')} disabled={pending || !prompt.trim()}>
              Ask
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssistantStatus(props: {
  error: string;
  status: AiAssistantProviderStatus | null;
}) {
  const text = props.error || props.status?.detail || 'Checking assistant...';
  const tone = props.error || props.status?.connected === false
    ? 'text-amber-200'
    : 'text-muted-foreground/72';
  return <p className={`text-[12px] ${tone}`}>{text}</p>;
}

function AssistantAnswer(props: { answer: string }) {
  if (!props.answer) {
    return null;
  }
  return (
    <div className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-sm border border-white/[0.055] bg-black/10 px-3 py-2 text-[13px] leading-5 text-foreground/86">
      {props.answer}
    </div>
  );
}
