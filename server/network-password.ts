import type { NetworkAuthMethod } from '../shared/protocol.js';
import { badRequest } from './app-error.js';

const lineBreakPattern = /[\r\n]/;
const whitespacePattern = /\s/;

export const validatePasswordForAuthMethod = (
  password: string | undefined,
  authMethod: NetworkAuthMethod
) => {
  if (password === undefined || password.length === 0) {
    return;
  }
  if (lineBreakPattern.test(password)) {
    throw badRequest('Password cannot contain carriage returns or line feeds');
  }
  if (authMethod === 'nickserv' && whitespacePattern.test(password)) {
    throw badRequest('NickServ passwords cannot contain whitespace');
  }
};
