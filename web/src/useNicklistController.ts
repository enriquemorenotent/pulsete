import { useMemo } from 'react';
import type { DesktopShellProps } from './DesktopShell.js';
import type { State } from './app-types.js';
import type { NicklistActionSet } from './useAppActions.js';

type NicklistControllerParams = {
  actions: NicklistActionSet;
  friends: State['domain']['friends'];
};

export function useNicklistController({
  actions,
  friends,
}: NicklistControllerParams): DesktopShellProps['nicklist'] {
  return useMemo(() => ({
    friends,
    onAddFriend: actions.addFriend,
    onRemoveFriend: actions.removeFriend,
    onSelectNick: actions.selectPrivateBuffer,
  }), [actions.addFriend, actions.removeFriend, actions.selectPrivateBuffer, friends]);
}
