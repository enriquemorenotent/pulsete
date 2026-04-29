const commandDefinitions = [
  { name: 'join', slash: ['join', 'j'], raw: ['JOIN'] },
  { name: 'part', slash: ['part', 'p'], raw: ['PART'] },
  { name: 'msg', slash: ['msg', 'm'], raw: ['PRIVMSG'] },
  { name: 'query', slash: ['query', 'q'], raw: [] },
  { name: 'list', slash: ['list'], raw: ['LIST'] },
  { name: 'whois', slash: ['whois', 'w'], raw: ['WHOIS'] },
  { name: 'nickserv', slash: ['nickserv', 'ns'], raw: [] },
  { name: 'chanserv', slash: ['chanserv', 'cs'], raw: [] },
  { name: 'hostserv', slash: ['hostserv', 'hs'], raw: [] },
  { name: 'me', slash: ['me'], raw: [] },
  { name: 'nick', slash: ['nick', 'n'], raw: ['NICK'] },
  { name: 'topic', slash: ['topic'], raw: ['TOPIC'] },
  { name: 'raw', slash: ['raw'], raw: [] },
  { name: 'connect', slash: ['connect'], raw: [] },
  { name: 'disconnect', slash: ['disconnect'], raw: [] },
  { name: 'close', slash: ['close'], raw: [] },
  { name: 'quit', slash: [], raw: ['QUIT'] },
] as const;

const slashCommandNames = new Map<string, string>();
const rawCommandNames = new Map<string, string>();
type SlashCommandCompletionName = NonNullable<(typeof commandDefinitions)[number]['slash'][0]>;

export const slashIrcClientCommandCompletionCandidates = commandDefinitions
  .map((definition) => definition.slash[0])
  .filter((command): command is SlashCommandCompletionName => Boolean(command))
  .map((command) => `/${command}`);

for (const definition of commandDefinitions) {
  for (const alias of definition.slash) {
    slashCommandNames.set(alias, definition.name);
  }
  for (const alias of definition.raw) {
    rawCommandNames.set(alias, definition.name);
  }
}

export type ParsedIrcClientCommand = {
  name: string;
  args: string[];
  remainder: string;
};

const parseCommand = (
  text: string,
  normalizeToken: (value: string) => string,
  options: { allowEmpty: boolean } = { allowEmpty: false }
) => {
  const trimmed = text.trim();
  if (!trimmed) {
    return options.allowEmpty
      ? ({
          name: '',
          args: [],
          remainder: '',
        } satisfies ParsedIrcClientCommand)
      : null;
  }
  const [token = '', ...args] = trimmed.split(/\s+/);
  return {
    name: normalizeToken(token),
    args,
    remainder: trimmed.slice(token.length).trim(),
  } satisfies ParsedIrcClientCommand;
};

export const parseSlashIrcClientCommand = (text: string) => {
  if (!text.startsWith('/')) {
    return null;
  }
  return parseCommand(
    text.slice(1),
    (value) => slashCommandNames.get(value.toLowerCase()) ?? value.toLowerCase(),
    { allowEmpty: true }
  );
};

export const parseRawIrcClientCommand = (text: string) =>
  parseCommand(text, (value) => rawCommandNames.get(value.toUpperCase()) ?? value.toLowerCase(), { allowEmpty: true });
