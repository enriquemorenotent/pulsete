export type IrcMessageTags = Record<string, string | null>;

export const parseIrcMessageTags = (value: string): IrcMessageTags => {
  const tags: IrcMessageTags = {};
  for (const entry of value.split(';')) {
    if (!entry) {
      continue;
    }
    const separatorIndex = entry.indexOf('=');
    const key = separatorIndex === -1 ? entry : entry.slice(0, separatorIndex);
    if (!key) {
      continue;
    }
    const rawValue = separatorIndex === -1 ? null : entry.slice(separatorIndex + 1);
    tags[key] = rawValue ? unescapeTagValue(rawValue) : null;
  }
  return tags;
};

export const encodeIrcMessageTags = (tags: IrcMessageTags) =>
  Object.entries(tags)
    .filter(([key]) => key)
    .map(([key, value]) => (value == null ? key : `${key}=${escapeTagValue(value)}`))
    .join(';');

export const parseServerTimeTag = (tags: IrcMessageTags) => {
  const raw = tags.time;
  if (!raw) {
    return null;
  }
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const escapeTagValue = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\:')
    .replace(/ /g, '\\s')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');

const unescapeTagValue = (value: string) => {
  let output = '';
  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    if (current !== '\\') {
      output += current;
      continue;
    }
    const next = value[index + 1];
    if (next === undefined) {
      break;
    }
    index += 1;
    if (next === ':') {
      output += ';';
    } else if (next === 's') {
      output += ' ';
    } else if (next === '\\') {
      output += '\\';
    } else if (next === 'r') {
      output += '\r';
    } else if (next === 'n') {
      output += '\n';
    } else {
      output += next;
    }
  }
  return output;
};
