import { useMemo } from 'react';
import { selectRightSidebarKind, selectSelectedBufferId } from './app-selectors.js';
import { useAppDispatch, useAppSelector } from './app-store.js';
import type { ApplyServerMessages } from './app-actions-types.js';
import type { ComposerStoreApi } from './composer-store.js';
import {
  ChatPaneContainer,
  CommandPaletteDialogContainer,
  ConnectionSidebarContainer,
  WorkspaceRightSidebarContainer,
} from './DesktopShellContainers.js';
import {
  NetworkEditorDialogContainer,
  NetworkManagerDialogContainer,
  PreferencesDialogContainer,
} from './DesktopShellDialogContainers.js';
import { DesktopShellLayout } from './DesktopShellLayout.js';
import { useDesktopHeaderModel } from './useDesktopShellModel.js';
import type { AppActions } from './useAppActions.js';
import type { BackgroundDmAudioState } from './useBackgroundDmAudio.js';
import type { AppUiState } from './useAppUiState.js';

type DesktopShellProps = {
  actions: AppActions;
  applyServerMessages: ApplyServerMessages;
  backgroundDmAudio: BackgroundDmAudioState;
  composer: ComposerStoreApi;
  previewBackgroundDmAudio: BackgroundDmAudioState['setSound'];
  primeBackgroundDmAudio: () => void;
  ui: AppUiState;
};

export function DesktopShell(props: DesktopShellProps) {
  const dispatch = useAppDispatch();
  const header = useDesktopHeaderModel({ dispatch, ui: props.ui });
  const rightSidebarKind = useAppSelector(selectRightSidebarKind);
  const selectedBufferId = useAppSelector(selectSelectedBufferId);
  const commandPalette = useMemo(
    () => ({
      onOpen: props.ui.openCommandPalette,
      open: props.ui.commandPaletteOpen,
    }),
    [props.ui.commandPaletteOpen, props.ui.openCommandPalette],
  );

  return (
    <DesktopShellLayout
      header={header}
      commandPalette={commandPalette}
      selectedBufferId={selectedBufferId}
      rightSidebarKind={rightSidebarKind}
      sidebar={<ConnectionSidebarContainer actions={props.actions} ui={props.ui} />}
      chat={
        <ChatPaneContainer
          actions={props.actions}
          applyServerMessages={props.applyServerMessages}
          backgroundDmAudio={props.backgroundDmAudio}
          composer={props.composer}
          primeBackgroundDmAudio={props.primeBackgroundDmAudio}
        />
      }
      rightSidebar={
        rightSidebarKind ? (
          <WorkspaceRightSidebarContainer
            actions={props.actions}
            backgroundDmAudio={props.backgroundDmAudio}
            primeBackgroundDmAudio={props.primeBackgroundDmAudio}
          />
        ) : null
      }
      commandPaletteDialog={
        <CommandPaletteDialogContainer actions={props.actions} ui={props.ui} />
      }
      preferencesDialog={
        <PreferencesDialogContainer
          actions={props.actions}
          backgroundDmAudio={props.backgroundDmAudio}
          previewBackgroundDmAudio={props.previewBackgroundDmAudio}
          primeBackgroundDmAudio={props.primeBackgroundDmAudio}
          ui={props.ui}
        />
      }
      networkManagerDialog={<NetworkManagerDialogContainer actions={props.actions} />}
      networkEditorDialog={<NetworkEditorDialogContainer actions={props.actions} />}
    />
  );
}
