export const maxIrcCommandBytes = 510;
export const maxBufferedIrcBytes = 16 * 1024;
export const maxIsonNickBytes = maxIrcCommandBytes - Buffer.byteLength('ISON ', 'utf8');
