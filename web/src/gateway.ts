export const gatewayReconnectBannerOptions = { id: 'gateway-reconnect', dismissAfterMs: null } as const;
export const gatewayReconnectMessage = 'Reconnecting to gateway';
export const gatewaySocketClosedMessage = 'Gateway socket is not open';

export class GatewaySocketClosedError extends Error {
  constructor(options?: ErrorOptions) {
    super(gatewaySocketClosedMessage, options);
    this.name = 'GatewaySocketClosedError';
  }
}

export const getGatewayReconnectDelayMs = (attempt: number) => {
  if (attempt <= 0) {
    return 1_000;
  }
  if (attempt === 1) {
    return 2_000;
  }
  return 5_000;
};

export const isGatewaySocketClosedError = (error: unknown): error is GatewaySocketClosedError =>
  error instanceof GatewaySocketClosedError;

export const toGatewayErrorOptions = (error: unknown) =>
  isGatewaySocketClosedError(error) ? gatewayReconnectBannerOptions : undefined;

export const toGatewayErrorMessage = (error: unknown, fallback: string) =>
  isGatewaySocketClosedError(error) ? gatewayReconnectMessage : error instanceof Error ? error.message : fallback;
