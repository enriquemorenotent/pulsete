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
  return {
    friends: state.domain.friends,
    onAddFriend: actions.addFriend,
    onRemoveFriend: actions.removeFriend,
    onSelectNick: actions.selectPrivateBuffer,
  };
}
