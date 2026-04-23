import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { SendHorizonal } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { cn } from '@/lib/utils.js';
import {
  getComposerCompletionResult,
  type ComposerCompletionDirection,
  type ComposerCompletionSession,
} from './composer-completion.js';
import { resolveChatPaneComposerPrompt } from './chat-pane-composer-prompt.js';
import type { ComposerMode } from './workspace-types.js';

type ChatPaneComposerKeyEvent = {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  nativeEvent: {
    isComposing?: boolean;
  };
};

export const getChatPaneComposerKeyAction = (
  event: ChatPaneComposerKeyEvent,
  draft: string,
): 'recall-older' | 'recall-newer' | 'retain-focus' | 'send' | null => {
  if (event.key === 'ArrowUp' && !event.altKey && !event.ctrlKey && !event.metaKey) {
    return 'recall-older';
  }
  if (event.key === 'ArrowDown' && !event.altKey && !event.ctrlKey && !event.metaKey) {
    return 'recall-newer';
  }
  if (event.key === 'Tab' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && draft.length > 0) {
    return 'retain-focus';
  }
  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
    return 'send';
  }
  return null;
};

export const shouldAutoFocusChatPaneComposer = (
  previousContextKey: string | null,
  nextContextKey: string | null,
) => !!nextContextKey && previousContextKey !== nextContextKey;

type ChatPaneComposerProps = {
  draft: string;
  mode: ComposerMode;
  placeholder: string;
  focusContextKey?: string | null;
  completionEnabled?: boolean;
  completionContextKey?: string | null;
  completionCandidates?: string[];
  onDraftChange: (value: string) => void;
  onRecallOlderDraft: () => void;
  onRecallNewerDraft: () => void;
  onSend: () => Promise<boolean>;
};

export function ChatPaneComposer(props: ChatPaneComposerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const completionSessionRef = useRef<ComposerCompletionSession | null>(null);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const previousFocusContextKeyRef = useRef<string | null>(props.focusContextKey ?? null);
  const prompt = useMemo(
    () => resolveChatPaneComposerPrompt({ mode: props.mode }),
    [props.mode]
  );

  useEffect(() => {
    completionSessionRef.current = null;
  }, [props.completionCandidates, props.completionContextKey]);

  useEffect(() => {
    const nextFocusContextKey = props.focusContextKey ?? null;
    const previousFocusContextKey = previousFocusContextKeyRef.current;
    previousFocusContextKeyRef.current = nextFocusContextKey;
    if (!shouldAutoFocusChatPaneComposer(previousFocusContextKey, nextFocusContextKey)) {
      return;
    }
    const input = inputRef.current;
    if (!input) {
      return;
    }
    input.focus({ preventScroll: true });
    const caret = input.value.length;
    input.setSelectionRange(caret, caret);
  }, [props.focusContextKey]);

  useLayoutEffect(() => {
    const pendingSelection = pendingSelectionRef.current;
    if (!pendingSelection || !inputRef.current) {
      return;
    }
    inputRef.current.setSelectionRange(pendingSelection.start, pendingSelection.end);
    pendingSelectionRef.current = null;
  }, [props.draft]);

  const handleCompletionKey = (
    direction: ComposerCompletionDirection,
    selectionStart: number | null,
    selectionEnd: number | null,
  ) => {
    const completionContextKey = props.completionContextKey;
    if (!completionContextKey) {
      completionSessionRef.current = null;
      return;
    }
    const result = getComposerCompletionResult({
      candidates: props.completionCandidates ?? [],
      contextKey: completionContextKey,
      direction,
      draft: props.draft,
      selectionStart,
      selectionEnd,
      session: completionSessionRef.current,
    });
    completionSessionRef.current = result?.session ?? null;
    if (!result) {
      pendingSelectionRef.current = null;
      return;
    }
    pendingSelectionRef.current = {
      start: result.selectionStart,
      end: result.selectionEnd,
    };
    props.onDraftChange(result.draft);
  };

  return (
    <footer className="shrink-0 border-t border-white/6 bg-background/32 px-4 py-3 backdrop-blur-sm">
      <div className="flex gap-2 rounded-[1rem] bg-black/12 p-2 ring-1 ring-white/[0.05]">
        {prompt.prefixSymbol ? (
          <div
            className={cn(
              'flex min-w-9 shrink-0 items-center justify-center rounded-[0.8rem] px-2 font-mono text-[12px] font-semibold',
              'bg-amber-300/12 text-amber-300 ring-1 ring-inset ring-amber-300/20'
            )}
            aria-hidden="true"
          >
            {prompt.prefixSymbol}
          </div>
        ) : null}
        <Input
          ref={inputRef}
          value={props.draft}
          className="flex-1 border-transparent bg-transparent focus-visible:border-ring/40"
          onBlur={() => {
            completionSessionRef.current = null;
            pendingSelectionRef.current = null;
          }}
          onChange={(event) => {
            completionSessionRef.current = null;
            pendingSelectionRef.current = null;
            props.onDraftChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (
              props.completionEnabled
              && event.key === 'Tab'
              && !event.altKey
              && !event.ctrlKey
              && !event.metaKey
              && !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              handleCompletionKey(
                event.shiftKey ? 'backward' : 'forward',
                event.currentTarget.selectionStart,
                event.currentTarget.selectionEnd,
              );
              return;
            }
            const action = getChatPaneComposerKeyAction(event, props.draft);
            if (!action) {
              return;
            }
            event.preventDefault();
            if (action === 'recall-older') {
              props.onRecallOlderDraft();
              return;
            }
            if (action === 'recall-newer') {
              props.onRecallNewerDraft();
              return;
            }
            if (action === 'send') {
              void props.onSend();
            }
          }}
          placeholder={props.placeholder}
        />
        <Button size="sm" variant={prompt.variant === 'commands' ? 'secondary' : 'default'} onClick={() => void props.onSend()}>
          <SendHorizonal />
          {prompt.actionLabel}
        </Button>
      </div>
    </footer>
  );
}
