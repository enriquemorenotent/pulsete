export type LocalIrcIdentity = {
  nick: string;
  altNicks: string[];
  username: string;
  realName: string;
};

export const getLocalIrcIdentity = (): LocalIrcIdentity => ({
  nick: 'pulsete',
  altNicks: ['pulsete_', 'pulsete__'],
  username: 'pulsete',
  realName: 'Pulsete',
});
