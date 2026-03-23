import type { State } from './app-types.js';
import { useAppLifecycle } from './useAppLifecycle.js';
import { useDesktopShellModel } from './useDesktopShellModel.js';
import { useAppSession } from './useAppSession.js';
import { useAppUiState } from './useAppUiState.js';
import { useComposerHistory } from './composer-history.js';

type AppController = {
  banner: State['transient']['banner'];
  shell: ReturnType<typeof useDesktopShellModel>;
  dismissBanner: () => void;
  phase: State['domain']['phase'];
};

export function useAppController(): AppController {
  const composer = useComposerHistory();
  const ui = useAppUiState();
  const { actions, model, dispatch, state } = useAppSession({ composer, ui });

  useAppLifecycle({
    banner: state.transient.banner,
    gatewayStatus: state.domain.gatewayStatus,
    networks: state.domain.networks,
    phase: state.domain.phase,
    networkManager: state.transient.networkManager,
    workspace: model.workspace,
    visibleNetworks: model.visibleNetworks,
    dispatch,
    socketRef: ui.socketRef,
    scrollRef: ui.scrollRef,
    didAutoOpenManagerRef: ui.didAutoOpenManagerRef,
  });

  const shell = useDesktopShellModel({
    actions,
    composer,
    dispatch,
    model,
    transient: state.transient,
    friends: state.domain.friends,
    friendPresence: state.domain.friendPresence,
    ui,
  });

  return {
    phase: state.domain.phase,
    banner: state.transient.banner,
    dismissBanner: () => dispatch({ type: 'set-banner', banner: null }),
    shell,
  };
}
