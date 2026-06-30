export const normalizeAccountName = (value: string | null) => {
  const account = value?.trim();
  return account && account !== '*' ? account : null;
};

export const parseWhoRealname = (value: string | null) =>
  value?.replace(/^\d+\s+/, '').trim() || null;
