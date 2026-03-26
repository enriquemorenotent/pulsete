import type { ComposerMode } from './workspace-types.js';

type ComposerPromptContext = {
  mode: ComposerMode;
};

export type ChatPaneComposerPrompt = {
  actionLabel: 'Run' | 'Send';
  prefixSymbol: '/' | null;
  variant: 'commands' | 'normal';
};

export const resolveChatPaneComposerPrompt = (
  context: ComposerPromptContext,
): ChatPaneComposerPrompt => {
  if (context.mode === 'commands') {
    return {
      actionLabel: 'Run',
      prefixSymbol: '/',
      variant: 'commands',
    };
  }

  return {
    actionLabel: 'Send',
    prefixSymbol: null,
    variant: 'normal',
  };
};
