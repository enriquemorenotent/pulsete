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
