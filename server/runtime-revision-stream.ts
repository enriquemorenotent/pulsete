import { randomUUID } from 'node:crypto';
import type { ServerMessage } from '../shared/protocol-messages.js';
import type { StateRevision } from '../shared/protocol-sync.js';

export class RuntimeRevisionStream {
  private readonly epoch = randomUUID();
  private revision = 0;

  current(): StateRevision { return { epoch: this.epoch, revision: this.revision }; }

  stamp(messages: readonly ServerMessage[]): ServerMessage[] {
    return messages.map(message => {
      this.revision += 1;
      return { ...message, sync: this.current() };
    });
  }
}
