import type tls from 'node:tls';

const formatNameParts = (record: Record<string, string> | undefined) => {
  if (!record) {
    return [];
  }

  return Object.entries(record).map(([key, value]) => `${key}=${value}`);
};

const formatCertLine = (label: string, record: Record<string, string> | undefined) => {
  const parts = formatNameParts(record);
  return parts.length > 0 ? `* ${label}: /${parts.join('/')}` : null;
};

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
  const parts = [
    days > 0 ? `${days}d` : null,
    hours > 0 ? `${hours}h` : null,
    minutes > 0 ? `${minutes}m` : null,
    seconds > 0 || totalSeconds === 0 ? `${seconds}s` : null,
  ].filter(Boolean);

  return parts.join(' ');
};

const formatWhoisNumeric = (command: string, params: string[]) => {
  const nick = normalizeText(params[1]);

  if (command === '301') {
    const awayMessage = normalizeText(params[2]);
    return nick && awayMessage ? [`* ${nick} is away: ${awayMessage}`] : [];
  }

  if (command === '311') {
    const username = normalizeText(params[2]);
    const host = normalizeText(params[3]);
    const realName = normalizeText(params[5]);
    if (!nick || !username || !host) {
      return [];
    }
    return [`* ${nick} is ${username}@${host}${realName ? ` (${realName})` : ''}`];
  }

  if (command === '312') {
    const server = normalizeText(params[2]);
    const serverInfo = normalizeText(params[3]);
    if (!nick || !server) {
      return [];
    }
    return [`* ${nick} is using ${server}${serverInfo ? ` (${serverInfo})` : ''}`];
  }

  if (command === '313') {
    const detail = normalizeText(params[2]);
    return nick && detail ? [`* ${nick} ${detail}`] : [];
  }

  if (command === '317') {
    const idle = formatDuration(normalizeText(params[2]));
    return nick && idle ? [`* ${nick} has been idle for ${idle}`] : [];
  }

  if (command === '318') {
    return nick ? [`* End of WHOIS for ${nick}`] : [];
  }

  if (command === '319') {
    const channels = normalizeText(params[2]);
    return nick && channels ? [`* ${nick} is on ${channels}`] : [];
  }

  if (command === '330') {
    const account = normalizeText(params[2]);
    return nick && account ? [`* ${nick} is logged in as ${account}`] : [];
  }

  if (command === '338') {
    const host = normalizeText(params[2]);
    return nick && host ? [`* ${nick} is connecting from ${host}`] : [];
  }

  if (command === '401') {
    const target = nick;
    const detail = normalizeText(params[2]);
    if (detail) {
      return [`* ${detail}${target ? `: ${target}` : ''}`];
    }
    return target ? [`* No such nick/channel: ${target}`] : [];
  }

  if (command === '402') {
    const server = nick;
    const detail = normalizeText(params[2]);
    if (detail) {
      return [`* ${detail}${server ? `: ${server}` : ''}`];
    }
    return server ? [`* No such server: ${server}`] : [];
  }

  return [];
};

export const formatTlsStatusLines = (socket: tls.TLSSocket) => {
  const lines: string[] = [];
  const certificate = socket.getPeerCertificate(true) as
    | (tls.PeerCertificate & {
        issuerCertificate?: tls.PeerCertificate;
        bits?: number;
        pubkeyalgo?: string;
      })
    | null;

  if (certificate) {
    const chain = [];
    let current: typeof certificate | undefined | null = certificate;
    const seen = new Set<string>();
    while (current && Object.keys(current).length > 0) {
      const fingerprint = normalizeText(current.fingerprint256) || normalizeText(current.fingerprint);
      if (fingerprint && seen.has(fingerprint)) {
        break;
      }
      if (fingerprint) {
        seen.add(fingerprint);
      }
      chain.push(current);
      if (!current.issuerCertificate || current.issuerCertificate === current) {
        break;
      }
      current = current.issuerCertificate as typeof certificate;
    }

    for (const entry of chain) {
      const subjectLine = formatCertLine('* Subject', entry.subject as Record<string, string> | undefined);
      const issuerLine = formatCertLine('* Issuer', entry.issuer as Record<string, string> | undefined);
      if (subjectLine) {
        lines.push(subjectLine);
      }
      if (issuerLine) {
        lines.push(issuerLine);
      }
    }

    lines.push('* Certification info:');
    lines.push('*   Subject:');
    for (const part of formatNameParts(certificate.subject as Record<string, string> | undefined)) {
      lines.push(`*     ${part}`);
    }
    lines.push('*   Issuer:');
    for (const part of formatNameParts(certificate.issuer as Record<string, string> | undefined)) {
      lines.push(`*     ${part}`);
    }
    if (certificate.pubkeyalgo || certificate.bits) {
      lines.push(
        `*   Public key algorithm: ${normalizeText(certificate.pubkeyalgo) || 'unknown'} (${certificate.bits ?? 0} bits)`
      );
    }
    if (certificate.valid_from && certificate.valid_to) {
      lines.push(`*   Valid since ${certificate.valid_from} to ${certificate.valid_to}`);
    }
  }

  const cipher = socket.getCipher();
  const protocol = socket.getProtocol();
  if (cipher) {
    lines.push('* Cipher info:');
    lines.push(`*   Version: ${protocol ?? 'unknown'}, cipher ${cipher.standardName ?? cipher.name}`);
  }

  return lines;
};

const SERVER_TEXT_NUMERICS = new Set([
  '001',
  '002',
  '003',
  '004',
  '005',
  '042',
  '251',
  '252',
  '254',
  '255',
  '265',
  '266',
  '372',
]);

export const formatServerNumeric = (command: string, params: string[]) => {
  const whoisLines = formatWhoisNumeric(command, params);
  if (whoisLines.length > 0) {
    return whoisLines;
  }

  if (command === '375') {
    return ['* - Message of the Day -'];
  }

  if (command === '376') {
    return ['* End of /MOTD command.'];
  }

  if (command === '396') {
    const text = normalizeText(params.at(-1));
    return text ? [`* ${text}`] : [];
  }

  if (command === '433') {
    return [];
  }

  if (!SERVER_TEXT_NUMERICS.has(command)) {
    return [];
  }

  const body = params
    .slice(1)
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .join(' ');

  if (!body) {
    return [];
  }

  return [`* ${body}`];
};
