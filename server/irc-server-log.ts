import type tls from 'node:tls';
import { formatWhoisNumeric } from './irc-server-log-whois.js';

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

const deliveryErrorNumerics = new Set(['716', '717']);
const isErrorNumeric = (command: string) => /^[45]\d{2}$/.test(command) || deliveryErrorNumerics.has(command);
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

const silentNumericReplies = new Set(['332', '353']);

export const formatServerNumeric = (
  command: string,
  params: string[],
  options: { allowTopicPayload?: boolean; allowNamesPayload?: boolean } = {}
) => {
  const whoisLines = formatWhoisNumeric(command, params);
  if (whoisLines.length > 0) {
    return whoisLines;
  }

  if (command === '303') {
    const online = normalizeText(params[1]);
    return [online ? `* Online: ${online}` : '* No requested nicks are online'];
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

  if (command === '332' && options.allowTopicPayload) {
    const channel = normalizeText(params[1]);
    const topic = normalizeText(params[2]);
    return channel && topic ? [`* ${channel} ${topic}`] : [];
  }

  if (command === '353' && options.allowNamesPayload) {
    const channel = normalizeText(params[2]);
    const names = normalizeText(params[3]);
    return channel && names ? [`* ${channel} ${names}`] : [];
  }

  if (command === '433') {
    return [];
  }

  if (isErrorNumeric(command)) {
    const body = params
      .slice(1)
      .map((part) => normalizeText(part))
      .filter(Boolean)
      .join(' ');

    return body ? [`* ${body}`] : [];
  }

  if (silentNumericReplies.has(command)) {
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

export const getServerNumericStatusKind = (command: string): 'system' | 'error' =>
  isErrorNumeric(command) ? 'error' : 'system';
