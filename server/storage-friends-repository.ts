import { StorageWatchlistActivity } from './storage-watchlist-activity.js';
import type { SqliteDb } from './storage-sqlite.js';
import { getFriend, listFriends, removeFriend, upsertFriend } from './storage-friends.js';
import type { FriendInput } from './storage-types.js';

export class StorageFriendsRepository {
  readonly activity: StorageWatchlistActivity;

  constructor(private readonly db: SqliteDb) {
    this.activity = new StorageWatchlistActivity(db);
  }

  list() {
    return listFriends(this.db);
  }

  get(friendId: string) {
    return getFriend(this.db, friendId);
  }

  upsert(input: FriendInput) {
    return upsertFriend(this.db, input);
  }

  remove(friendId: string) {
    return removeFriend(this.db, friendId);
  }
}
