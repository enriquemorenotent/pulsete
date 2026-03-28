export const isStandardReplyCommand = (command: string) =>
  command === 'FAIL' || command === 'WARN' || command === 'NOTE';

export const getStandardReplyStatusKind = (command: string): 'error' | 'notice' | 'system' => {
  if (command === 'FAIL') {
    return 'error';
  }
  if (command === 'WARN') {
    return 'notice';
  }
  return 'system';
};

export const formatStandardReply = (command: string, params: string[]) => {
  const description = normalizeText(params.at(-1));
  const code = normalizeText(params[1]);
  if (description) {
    return [`* ${description}`];
  }
  if (code) {
    return [`* ${command} ${code}`];
  }
  return [];
};

const normalizeText = (value: string | undefined) => (value ?? '').trim();
