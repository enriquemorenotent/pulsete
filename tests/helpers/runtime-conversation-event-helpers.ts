import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleRuntimeEvent } from '../../server/runtime-events.js';
import { Storage } from '../../server/storage.js';
import { createNetworkInput } from './runtime-test-common.js';

type RuntimeEvent = Parameters<typeof handleRuntimeEvent>[1];

export type PublishedRuntimeMessage = { type: string; [key: string]: unknown };

export const createRuntimeEventHarness = () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  const sent: PublishedRuntimeMessage[] = [];
  const publishEvent = (event: RuntimeEvent) =>
    handleRuntimeEvent({ store: storage, publish(message) { sent.push(message); } }, event);

  return { network, publishEvent, sent, storage };
};

export const messageBodies = (
  harness: ReturnType<typeof createRuntimeEventHarness>,
  target: string,
  limit = 10,
) => harness.storage.conversations
  .listMessages(harness.network.id, target, limit)
  .map((message) => message.body);
