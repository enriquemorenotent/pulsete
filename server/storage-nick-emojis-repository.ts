import type { SqliteDb } from './storage-sqlite.js';
import {
  getNickEmoji,
  getNickEmojiByNick,
  listNickEmojis,
  removeNickEmoji,
  removeNickEmojiByNick,
  upsertNickEmoji,
} from './storage-nick-emojis.js';
import type { NickEmojiInput } from './storage-types.js';

export class StorageNickEmojisRepository {
  constructor(private readonly db: SqliteDb) {}

  list(networkId?: string) {
    return listNickEmojis(this.db, networkId);
  }

  get(nickEmojiId: string) {
    return getNickEmoji(this.db, nickEmojiId);
  }

  findByNick(networkId: string, nick: string) {
    return getNickEmojiByNick(this.db, networkId, nick);
  }

  upsert(input: NickEmojiInput) {
    return upsertNickEmoji(this.db, input);
  }

  remove(nickEmojiId: string) {
    return removeNickEmoji(this.db, nickEmojiId);
  }

  removeByNick(networkId: string, nick: string) {
    return removeNickEmojiByNick(this.db, networkId, nick);
  }
}
