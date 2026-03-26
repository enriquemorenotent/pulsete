export const FRIENDS_SIDEBAR_EXPANDED_STORAGE_KEY = 'pulsete.sidebar.friends.expanded';

export const readFriendsSidebarExpanded = (storedValue: string | null, fallback: boolean) => {
  if (storedValue === 'true') {
    return true;
  }
  if (storedValue === 'false') {
    return false;
  }
  return fallback;
};
