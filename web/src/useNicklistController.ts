import { useMemo } from 'react';
import type { State } from './app-types.js';
import type { DesktopShellProps } from './DesktopShell.js';
import type { useAppActions } from './useAppActions.js';

type NicklistControllerParams = {
  actions: ReturnType<typeof useAppActions>;
  state: State;
};

export function useNicklistController({
  actions,
  state,
}: NicklistControllerParams): DesktopShellProps['nicklist'] {
  return useMemo(() => ({
    friends: state.domain.friends,
    onAddFriend: actions.addFriend,
    onRemoveFriend: actions.removeFriend,
    onSelectNick: actions.selectPrivateBuffer,
  }), [actions.addFriend, actions.removeFriend, actions.selectPrivateBuffer, state.domain.friends]);
}
