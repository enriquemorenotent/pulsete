import type { State } from './app-types.js';
import { useAppLifecycle } from './useAppLifecycle.js';
import { useDesktopShellController } from './useDesktopShellController.js';
import { useAppModel } from './useAppModel.js';
import { useAppUiState } from './useAppUiState.js';
import { useComposerHistory } from './composer-history.js';

type AppController = {
  banner: State['transient']['banner'];
  desktopShellProps: ReturnType<typeof useDesktopShellController>;
  dismissBanner: () => void;
  phase: State['domain']['phase'];
};

export function useAppController(): AppController {
  const composer = useComposerHistory();
  const ui = useAppUiState();
  const { actions, model, dispatch, state } = useAppModel({ composer, ui });

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

  const desktopShellProps = useDesktopShellController({
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
    desktopShellProps,
  };
}
