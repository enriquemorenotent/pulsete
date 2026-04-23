import type { SqliteDb } from './storage-sqlite.js';
import {
  getMutedNick,
  getMutedNickByNick,
  listMutedNicks,
  removeMutedNick,
  upsertMutedNick,
} from './storage-muted-nicks.js';
import type { MutedNickInput } from './storage-types.js';

export class StorageMutedNicksRepository {
  constructor(private readonly db: SqliteDb) {}

  list(networkId?: string) {
    return listMutedNicks(this.db, networkId);
  }

  get(mutedNickId: string) {
    return getMutedNick(this.db, mutedNickId);
  }

  findByNick(networkId: string, nick: string) {
    return getMutedNickByNick(this.db, networkId, nick);
  }

  upsert(input: MutedNickInput) {
    return upsertMutedNick(this.db, input);
  }

  remove(mutedNickId: string) {
    return removeMutedNick(this.db, mutedNickId);
  }
}
