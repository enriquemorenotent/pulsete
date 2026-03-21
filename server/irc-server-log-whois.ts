const normalizeText = (value: string | undefined) => (value ?? '').trim();

const formatDuration = (rawSeconds: string) => {
  const totalSeconds = Number.parseInt(rawSeconds, 10);
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return null;
  }
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [
    days > 0 ? `${days}d` : null,
    hours > 0 ? `${hours}h` : null,
    minutes > 0 ? `${minutes}m` : null,
    seconds > 0 || totalSeconds === 0 ? `${seconds}s` : null,
  ].filter(Boolean).join(' ');
};

export const formatWhoisNumeric = (command: string, params: string[]) => {
  const nick = normalizeText(params[1]);
  if (command === '301') {
    const awayMessage = normalizeText(params[2]);
    return nick && awayMessage ? [`* ${nick} is away: ${awayMessage}`] : [];
  }
  if (command === '311') {
    const username = normalizeText(params[2]);
    const host = normalizeText(params[3]);
    const realName = normalizeText(params[5]);
    return nick && username && host
      ? [`* ${nick} is ${username}@${host}${realName ? ` (${realName})` : ''}`]
      : [];
  }
  if (command === '312') {
    const server = normalizeText(params[2]);
    const serverInfo = normalizeText(params[3]);
    return nick && server ? [`* ${nick} is using ${server}${serverInfo ? ` (${serverInfo})` : ''}`] : [];
  }
  if (command === '313') {
    return nick && normalizeText(params[2]) ? [`* ${nick} ${normalizeText(params[2])}`] : [];
  }
  if (command === '317') {
    const idle = formatDuration(normalizeText(params[2]));
    return nick && idle ? [`* ${nick} has been idle for ${idle}`] : [];
  }
  if (command === '318') {
    return nick ? [`* End of WHOIS for ${nick}`] : [];
  }
  if (command === '319') {
    return nick && normalizeText(params[2]) ? [`* ${nick} is on ${normalizeText(params[2])}`] : [];
  }
  if (command === '330') {
    return nick && normalizeText(params[2]) ? [`* ${nick} is logged in as ${normalizeText(params[2])}`] : [];
  }
  if (command === '338') {
    return nick && normalizeText(params[2]) ? [`* ${nick} is connecting from ${normalizeText(params[2])}`] : [];
  }
  if (command === '401' || command === '402') {
    const target = nick;
    const detail = normalizeText(params[2]);
    if (detail) {
      return [`* ${detail}${target ? `: ${target}` : ''}`];
    }
    return target ? [`* ${command === '401' ? 'No such nick/channel' : 'No such server'}: ${target}`] : [];
  }
  return [];
};
