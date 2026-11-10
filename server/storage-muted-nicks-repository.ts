import { runInTransaction } from './storage-db.js';
import { refreshUnreadVisibility } from './storage-unread.js';
import type { SqliteDb } from './storage-sqlite.js';
import {
  getMutedNick,
  getMutedNickByIdentity,
  getMutedNickByNick,
  listMutedNicks,
  removeMutedNick,
  upsertMutedNick,
} from './storage-muted-nicks.js';
import type { MutedNickInput } from './storage-types.js';
import type { NetworkUserIdentity } from '../shared/user-identity.js';

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

  findByIdentity(networkId: string, nick: string, identity: NetworkUserIdentity) {
    return getMutedNickByIdentity(this.db, networkId, nick, identity);
  }

  upsert(input: MutedNickInput) {
    return runInTransaction(this.db, () => {
      const mutedNick = upsertMutedNick(this.db, input);
      refreshUnreadVisibility(this.db, input.networkId);
      return mutedNick;
    });
  }

  remove(mutedNickId: string) {
    return runInTransaction(this.db, () => {
      const mutedNick = removeMutedNick(this.db, mutedNickId);
      if (mutedNick) refreshUnreadVisibility(this.db, mutedNick.networkId);
      return mutedNick;
    });
  }
}
