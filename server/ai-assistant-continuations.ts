import { randomUUID } from 'node:crypto';
import type { AssistantDateRange } from './ai-assistant-dates.js';
import type { AiAssistantScope } from '../shared/protocol-ai.js';

export type AssistantContinuation = {
  bufferId: string;
  sessionId: string;
  scope: AiAssistantScope;
  question: string;
  range: AssistantDateRange | null;
  messageIds: string[];
};

export class AssistantContinuations {
  private entries = new Map<string, { value: AssistantContinuation; touched: number; bytes: number }>();
  constructor(private readonly now = Date.now) {}
  get(token: string | undefined, bufferId: string, sessionId: string) {
    this.prune();
    const entry = token ? this.entries.get(token) : undefined;
    if (!entry || entry.value.bufferId !== bufferId || entry.value.sessionId !== sessionId) return null;
    this.entries.delete(token!);
    entry.touched = this.now();
    this.entries.set(token!, entry);
    return entry.value;
  }
  put(value: AssistantContinuation) {
    const token = randomUUID();
    const bytes = Buffer.byteLength(JSON.stringify(value));
    if (bytes > 10_000_000) return undefined;
    this.entries.set(token, { value, touched: this.now(), bytes });
    this.prune();
    return token;
  }
  clear(bufferId: string, token?: string, sessionId?: string) {
    for (const [key, entry] of this.entries) {
      if (entry.value.bufferId === bufferId && (!token || key === token)
        && (sessionId === undefined || entry.value.sessionId === sessionId)) this.entries.delete(key);
    }
  }
  private prune() {
    for (const [key, entry] of this.entries) if (this.now() - entry.touched >= 30 * 60_000) this.entries.delete(key);
    let bytes = [...this.entries.values()].reduce((sum, entry) => sum + entry.bytes, 0);
    for (const [key, entry] of this.entries) {
      if (this.entries.size <= 100 && bytes <= 10_000_000) break;
      this.entries.delete(key);
      bytes -= entry.bytes;
    }
  }
}
