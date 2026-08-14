import { useEffect, useLayoutEffect, useRef } from 'react';
import { maxDraftCharacters } from '../../shared/protocol-preferences.js';
import { SendHorizonal, Terminal } from 'lucide-react';
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

export const shouldFocusChatPaneComposerFromRequest = (
  previousRequestId: number,
  nextRequestId: number,
) => previousRequestId !== nextRequestId;

type ChatPaneComposerProps = {
  draft: string;
  mode: ComposerMode;
  disabled?: boolean;
  placeholder: string;
  focusContextKey?: string | null;
  focusRequestId?: number;
  completionEnabled?: boolean;
  completionContextKey?: string | null;
  completionCandidates?: string[];
  completionCommandCandidates?: string[];
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
  const previousFocusRequestIdRef = useRef(props.focusRequestId ?? 0);
  const prompt = resolveChatPaneComposerPrompt({ mode: props.mode });

  useEffect(() => {
    completionSessionRef.current = null;
  }, [props.completionCandidates, props.completionCommandCandidates, props.completionContextKey]);

  useEffect(() => {
    const nextFocusContextKey = props.focusContextKey ?? null;
    const previousFocusContextKey = previousFocusContextKeyRef.current;
    previousFocusContextKeyRef.current = nextFocusContextKey;
    if (!shouldAutoFocusChatPaneComposer(previousFocusContextKey, nextFocusContextKey)) {
      return;
    }
    focusInputAtEnd(inputRef.current);
  }, [props.disabled, props.focusContextKey]);

  useEffect(() => {
    const nextFocusRequestId = props.focusRequestId ?? 0;
    const previousFocusRequestId = previousFocusRequestIdRef.current;
    previousFocusRequestIdRef.current = nextFocusRequestId;
    if (!shouldFocusChatPaneComposerFromRequest(previousFocusRequestId, nextFocusRequestId)) {
      return;
    }
    focusInputAtEnd(inputRef.current);
  }, [props.disabled, props.focusRequestId]);

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
      commandCandidates: props.completionCommandCandidates ?? [],
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
    <footer className="flex shrink-0 items-center gap-2 bg-[#101215] px-5 py-4">
      {prompt.prefixSymbol ? (
        <div
          className="flex h-10 min-w-9 shrink-0 items-center justify-center rounded-lg bg-amber-300/12 px-2 font-mono text-[12px] font-semibold text-amber-300 ring-1 ring-inset ring-amber-300/20"
          aria-hidden="true"
        >
          {prompt.prefixSymbol}
        </div>
      ) : null}
      <Input
        ref={inputRef}
        value={props.draft}
        maxLength={maxDraftCharacters}
        disabled={props.disabled}
        className={cn(
          'h-10 min-w-0 flex-1 border-[#2a2e34] bg-[#1a1d22] px-3 hover:border-white/15 focus-visible:border-ring/60',
          prompt.variant === 'commands' && 'border-amber-300/15 bg-amber-400/[0.045]'
        )}
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
      <Button
        size="sm"
        variant={prompt.variant === 'commands' ? 'secondary' : 'default'}
        className="h-10 shrink-0 px-3"
        disabled={props.disabled}
        onClick={() => void props.onSend()}
      >
        {prompt.actionIcon === 'terminal' ? <Terminal /> : <SendHorizonal />}
        {prompt.actionLabel}
      </Button>
    </footer>
  );
}

function focusInputAtEnd(input: HTMLInputElement | null) {
  if (!input || input.disabled) {
    return;
  }
  input.focus({ preventScroll: true });
  const caret = input.value.length;
  input.setSelectionRange(caret, caret);
}
