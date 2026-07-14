import { BoundedRecencySet } from '../bounded-recency-set.js';

export const avatarFailureCacheCapacity = 256;
export const failedAvatarUrls = new BoundedRecencySet<string>(avatarFailureCacheCapacity);
