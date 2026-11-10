import { z } from 'zod';

export const ircServerRulesSchema = z.object({
  caseMapping: z.enum(['ascii', 'rfc1459', 'rfc1459-strict']),
  channelTypes: z.string(),
  prefixModes: z.string(),
  prefixSymbols: z.string(),
  channelModes: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  monitor: z.number().int().nonnegative().nullable(),
  historyLimit: z.number().int().nonnegative().nullable(),
});
export type IrcServerRules = z.infer<typeof ircServerRulesSchema>;
export type IrcCaseMapping = IrcServerRules['caseMapping'];
export const defaultIrcServerRules: IrcServerRules = {
  caseMapping: 'rfc1459', channelTypes: '#&', prefixModes: 'ov', prefixSymbols: '@+',
  channelModes: ['b', 'k', 'l', 'imnpst'], monitor: null, historyLimit: null,
};

/** Retain advertised tokens so additions, removals and multi-line 005 replies compose. */
export class IrcServerSupport {
  received = false;
  private readonly tokens = new Map<string, string>();
  rules: IrcServerRules = structuredClone(defaultIrcServerRules);

  reset() { this.received = false; this.tokens.clear(); this.rules = structuredClone(defaultIrcServerRules); }

  update(params: readonly string[]) {
    const first = !this.received;
    this.received = true;
    const previous = JSON.stringify(this.rules);
    for (const token of params.slice(1)) {
      if (!/^-?[A-Z][A-Z0-9]*(?:=[^ ]*)?$/.test(token)) continue;
      const separator = token.indexOf('=');
      const name = separator < 0 ? token : token.slice(0, separator);
      if (name.startsWith('-')) this.tokens.delete(name.slice(1));
      else this.tokens.set(name, separator < 0 ? '' : token.slice(separator + 1));
    }
    const rules = structuredClone(defaultIrcServerRules);
    const mapping = this.tokens.get('CASEMAPPING');
    if (mapping === 'ascii' || mapping === 'rfc1459' || mapping === 'rfc1459-strict' || mapping === 'strict-rfc1459') {
      rules.caseMapping = mapping === 'strict-rfc1459' ? 'rfc1459-strict' : mapping;
    }
    const channelTypes = this.tokens.get('CHANTYPES');
    if (channelTypes !== undefined) rules.channelTypes = channelTypes;
    const prefix = this.tokens.get('PREFIX');
    const match = prefix?.match(/^\(([a-zA-Z]*)\)([^ ,]*)$/);
    if (match && match[1]!.length === match[2]!.length && new Set(match[1]).size === match[1]!.length && new Set(match[2]).size === match[2]!.length) {
      rules.prefixModes = match[1]!; rules.prefixSymbols = match[2]!;
    } else if (prefix === '') { rules.prefixModes = ''; rules.prefixSymbols = ''; }
    const modes = this.tokens.get('CHANMODES')?.split(',');
    if (modes && modes.length >= 4 && modes.slice(0, 4).every(group => /^[a-zA-Z]*$/.test(group))) {
      rules.channelModes = modes.slice(0, 4) as IrcServerRules['channelModes'];
    }
    const number = (name: string) => {
      const value = this.tokens.get(name);
      return value === '' ? 0 : value !== undefined && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
    };
    rules.monitor = number('MONITOR'); rules.historyLimit = number('CHATHISTORY');
    this.rules = rules;
    return first || previous !== JSON.stringify(rules);
  }
}

export const isServerChannel = (target: string, rules: IrcServerRules = defaultIrcServerRules) =>
  !!target && rules.channelTypes.includes(target[0]!);

export const modeArgument = (mode: string, adding: boolean, rules: IrcServerRules): boolean | null => {
  if (rules.prefixModes.includes(mode) || rules.channelModes[0].includes(mode) || rules.channelModes[1].includes(mode)) return true;
  if (rules.channelModes[2].includes(mode)) return adding;
  if (rules.channelModes[3].includes(mode)) return false;
  return null;
};
