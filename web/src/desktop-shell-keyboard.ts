export type DesktopShellShortcutKeyEvent = {
  altKey: boolean;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  isComposing?: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
};

export const shouldJumpChatToLatestFromKeydown = (
  event: DesktopShellShortcutKeyEvent,
  input: {
    blockingDialogOpen: boolean;
    hasSelectedBuffer: boolean;
    menuOpen: boolean;
  },
) =>
  !event.defaultPrevented
  && !event.isComposing
  && input.hasSelectedBuffer
  && !input.blockingDialogOpen
  && !input.menuOpen
  && !event.altKey
  && !event.ctrlKey
  && !event.metaKey
  && !event.shiftKey
  && event.key === 'Escape';
