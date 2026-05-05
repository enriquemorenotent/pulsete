import type { ComposerMode } from './workspace-types.js';

type ComposerPromptContext = {
  mode: ComposerMode;
};

export type ChatPaneComposerPrompt = {
  actionLabel: 'Run' | 'Send';
  actionIcon: 'send' | 'terminal';
  prefixSymbol: '/' | null;
  variant: 'commands' | 'normal';
};

export const resolveChatPaneComposerPrompt = (
  context: ComposerPromptContext,
): ChatPaneComposerPrompt => {
  if (context.mode === 'commands') {
    return {
      actionLabel: 'Run',
      actionIcon: 'terminal',
      prefixSymbol: '/',
      variant: 'commands',
    };
  }

  return {
    actionLabel: 'Send',
    actionIcon: 'send',
    prefixSymbol: null,
    variant: 'normal',
  };
};
