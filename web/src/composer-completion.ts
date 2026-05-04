import { slashIrcClientCommandCompletionCandidates } from '../../shared/irc-client-command.js';
import { normalizeIrcIdentifier } from '../../shared/irc-identifiers.js';
import type { WorkspaceView } from './workspace-types.js';

export {
  getComposerCompletionResult,
  type ComposerCompletionDirection,
  type ComposerCompletionResult,
  type ComposerCompletionSession,
} from './composer-completion-engine.js';

export type ComposerCompletionModel = {
  commandCandidates: string[];
  enabled: boolean;
  contextKey: string | null;
  candidates: string[];
};

const disabledCompletionModel: ComposerCompletionModel = {
  commandCandidates: [],
  enabled: false,
  contextKey: null,
  candidates: [],
};

export const dedupeIrcCompletionCandidates = (candidates: string[]) => {
  const seen = new Set<string>();
  const nextCandidates: string[] = [];
  for (const candidate of candidates) {
    const value = candidate.trim();
    if (!value) {
      continue;
    }
    const normalizedValue = normalizeIrcIdentifier(value);
    if (seen.has(normalizedValue)) {
      continue;
    }
    seen.add(normalizedValue);
    nextCandidates.push(value);
  }
  return nextCandidates;
};

export const buildComposerCompletionModel = (workspace: WorkspaceView): ComposerCompletionModel => {
  const selectedBuffer = workspace.selectedBuffer;
  if (!selectedBuffer || workspace.composerMode === 'hidden') {
    return disabledCompletionModel;
  }
  const commandCandidates = slashIrcClientCommandCompletionCandidates;

  if (workspace.composerMode === 'commands') {
    return {
      commandCandidates,
      enabled: true,
      contextKey: selectedBuffer.id,
      candidates: [],
    };
  }

  if (selectedBuffer.kind === 'channel' && workspace.selectedChannel) {
    return {
      commandCandidates,
      enabled: true,
      contextKey: selectedBuffer.id,
      candidates: dedupeIrcCompletionCandidates(
        workspace.selectedChannel.users.map((user) => user.nick),
      ),
    };
  }

  if (selectedBuffer.kind === 'query' && workspace.selectedNetwork) {
    return {
      commandCandidates,
      enabled: true,
      contextKey: selectedBuffer.id,
      candidates: dedupeIrcCompletionCandidates([
        selectedBuffer.target,
        workspace.selectedRuntime?.nick ?? workspace.selectedNetwork.nick,
      ]),
    };
  }

  return disabledCompletionModel;
};
