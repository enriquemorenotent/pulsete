import type { NetworkRuntimeState } from '../../shared/protocol-chat.js';

export type NetworkImageRuntimePhase = NetworkRuntimeState['phase'];

export const networkImageRuntimeClass = (
  runtime: Pick<NetworkRuntimeState, 'phase'> | null | undefined,
) => networkImageRuntimePhaseClass(runtime?.phase);

export const networkImageRuntimePhaseClass = (
  phase: NetworkImageRuntimePhase | null | undefined,
) => {
  if (phase === 'connecting') {
    return 'saturate-90';
  }
  if (phase !== 'connected') {
    return 'grayscale opacity-60';
  }
  return undefined;
};
