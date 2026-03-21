import type { DatabaseSync } from 'node:sqlite';
import { getFriend, listFriends, removeFriend, upsertFriend } from './storage-friends.js';
import type { FriendInput } from './storage-types.js';

export class StorageFriendsRepository {
  constructor(private readonly db: DatabaseSync) {}

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
