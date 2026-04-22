import type {
  AssistantActiveBuffer,
  AssistantTaskKind,
  AssistantThreadScope,
  AssistantTurn,
  AssistantTurnAttachmentInput,
  BufferState,
  NetworkProfile,
} from '../shared/protocol.js';
import { buildAssistantTurnInput } from './assistant-prompts.js';
import { buildAssistantHistoryPackage } from './assistant-history-package.js';
import { planAssistantAskTurn, resolveAssistantAskRetrieval } from './assistant-ask-planner.js';
import type {
  RuntimeConversationStore,
  RuntimeNetworkStore,
} from './runtime-store-ports.js';
import {
  findPendingAskClarification,
  findRecentAskResolvedSubject,
  findRecentAskRetrievals,
  mergeAskTurnRouting,
  renderAskRetrievalContexts,
  toAttachmentMetadata,
} from './assistant-service-turns.js';

export const toAssistantActiveBuffer = (buffer: BufferState | null) => {
  if (!buffer) {
    return null;
  }
  return {
    bufferId: buffer.id,
    networkId: buffer.networkId,
    target: buffer.target,
    title: buffer.target,
  } satisfies AssistantActiveBuffer;
};

export const resolveActiveBuffer = (
  conversations: Pick<RuntimeConversationStore, 'getBuffer'>,
  activeBufferId: string | null,
) => toAssistantActiveBuffer(activeBufferId ? conversations.getBuffer(activeBufferId) : null);

export const resolveBufferTaskContext = ({
  bufferId,
  networkId,
  scope,
  target,
  prompt,
  task,
  conversations,
  networks,
}: {
  bufferId: string | null;
  networkId: string | null;
  scope: AssistantThreadScope;
  target: string | null;
  prompt: string;
  task: AssistantTaskKind;
  conversations: Pick<RuntimeConversationStore, 'getBuffer' | 'listAllMessages'>;
  networks: Pick<RuntimeNetworkStore, 'get'>;
}) => {
  if (scope === 'free') {
    return {
      buffer: null,
      attachments: [],
      network: null,
      context: '',
    };
  }
  const buffer = bufferId ? conversations.getBuffer(bufferId) : null;
  const effectiveNetworkId = buffer?.networkId ?? networkId;
  const effectiveTarget = buffer?.target ?? target;
  const network = effectiveNetworkId ? networks.get(effectiveNetworkId) as NetworkProfile | null : null;
  const messages = effectiveNetworkId && effectiveTarget
    ? conversations.listAllMessages(effectiveNetworkId, effectiveTarget)
    : [];
  const history = buildAssistantHistoryPackage({
    messages,
    prompt,
    task,
  });
  return {
    buffer: buffer as BufferState | null,
    attachments: history.attachments,
    network,
    context: history.context,
  };
};

export const resolveAskContext = ({
  activeBuffer,
  networks,
  priorTurns,
  prompt,
  conversations,
}: {
  activeBuffer: AssistantActiveBuffer | null;
  networks: Pick<RuntimeNetworkStore, 'get'>;
  priorTurns: AssistantTurn[];
  prompt: string;
  conversations: Pick<RuntimeConversationStore, 'listBuffers' | 'listAllMessages' | 'getMessageWindow' | 'listOpeningMessages' | 'listRecentMessagesForBuffer' | 'searchMessages'>;
}) => {
  const previousRetrievals = findRecentAskRetrievals(priorTurns);
  const rememberedSubject = findRecentAskResolvedSubject(priorTurns);
  const queryBuffers = conversations.listBuffers()
    .filter((buffer) => buffer.kind === 'query')
    .map((buffer) => toAssistantActiveBuffer(buffer))
    .filter((buffer): buffer is AssistantActiveBuffer => buffer !== null);
  const plan = planAssistantAskTurn({
    prompt,
    queryBuffers,
    rememberedSubject,
    pendingClarification: findPendingAskClarification(priorTurns),
    previousRetrievals,
    selectedBuffer: activeBuffer,
  });
  const priorRetrievedContext = plan.reusePreviousRetrievals
    ? renderAskRetrievalContexts(previousRetrievals)
    : '';
  const networkId = plan.resolvedSubject?.networkId ?? activeBuffer?.networkId ?? null;
  const network = networkId ? networks.get(networkId) as NetworkProfile | null : null;
  if (plan.outcome !== 'retrieve' || !plan.resolvedSubject) {
    return {
      activeBuffer,
      resolvedSubject: plan.resolvedSubject,
      askInstruction: plan.instruction,
      network,
      priorRetrievedContext,
      retrievedContext: '',
      routing: mergeAskTurnRouting(plan.routing, []),
    };
  }
  const retrievals = plan.requests.map((request) => resolveAssistantAskRetrieval({
    conversations,
    request,
    subject: plan.resolvedSubject,
  }));
  return {
    activeBuffer,
    resolvedSubject: plan.resolvedSubject,
    askInstruction: plan.instruction,
    network,
    priorRetrievedContext,
    retrievedContext: renderAskRetrievalContexts(retrievals),
    routing: mergeAskTurnRouting(plan.routing, retrievals),
  };
};

export const buildAssistantExecutionInput = ({
  activeBuffer = null,
  askInstruction = '',
  attachments,
  buffer = null,
  context = '',
  network = null,
  priorRetrievedContext = '',
  priorTranscript,
  prompt,
  resolvedSubject = null,
  retrievedContext = '',
  scope,
  task,
}: {
  activeBuffer?: AssistantActiveBuffer | null;
  askInstruction?: string;
  attachments: AssistantTurnAttachmentInput[];
  buffer?: BufferState | null;
  context?: string;
  network?: NetworkProfile | null;
  priorRetrievedContext?: string;
  priorTranscript: string;
  prompt: string;
  resolvedSubject?: AssistantActiveBuffer | null;
  retrievedContext?: string;
  scope: AssistantThreadScope;
  task: AssistantTaskKind;
}) => {
  const items: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; url: string }
  > = [{
    type: 'text',
    text: buildAssistantTurnInput({
      activeBuffer,
      attachments: attachments.map(toAttachmentMetadata),
      askInstruction,
      buffer,
      context,
      network,
      priorRetrievedContext,
      priorTranscript,
      prompt,
      resolvedSubject,
      retrievedContext,
      scope,
      task,
    }),
  }];
  for (const attachment of attachments) {
    if (attachment.kind === 'text') {
      items.push({
        type: 'text' as const,
        text: [
          `Attached text file: ${attachment.name}`,
          `Mime type: ${attachment.mimeType}`,
          `Size: ${attachment.size} bytes`,
          '',
          attachment.text,
        ].join('\n'),
      });
      continue;
    }
    items.push({
      type: 'image' as const,
      url: attachment.dataUrl,
    });
  }
  return items;
};

export const resolveAssistantThreadScope = (
  task: AssistantTaskKind,
  scope: AssistantThreadScope | undefined,
  _bufferId: string | null,
): AssistantThreadScope => {
  if (task !== 'ask') {
    return 'buffer';
  }
  return scope ?? 'free';
};
